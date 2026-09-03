-- Keep receipt numbering unambiguous in PL/pgSQL. The p_ prefix makes the
-- function argument distinct from stock_receipt_number_sequences.period_key.
CREATE OR REPLACE FUNCTION public.next_stock_receipt_number(p_period_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sequence_value INTEGER;
BEGIN
  IF NULLIF(BTRIM(p_period_key), '') IS NULL THEN
    RAISE EXCEPTION 'Periode nomor penerimaan wajib diisi';
  END IF;

  INSERT INTO public.stock_receipt_number_sequences AS receipt_sequence (period_key, last_value)
  VALUES (p_period_key, 1)
  ON CONFLICT ON CONSTRAINT stock_receipt_number_sequences_pkey DO UPDATE
    SET last_value = receipt_sequence.last_value + 1,
        updated_at = NOW()
  RETURNING receipt_sequence.last_value INTO sequence_value;

  RETURN 'RCV/' || p_period_key || '/' || LPAD(sequence_value::TEXT, 4, '0');
END;
$$;

-- Receipt items retain the supplier transaction facts (via the receipt header
-- and immutable item rows), while stock_balances retains the moving HPP.
CREATE OR REPLACE FUNCTION public.create_stock_receipt_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  actor_name TEXT;
  supplier_row public.suppliers%ROWTYPE;
  product_row public.products%ROWTYPE;
  item JSONB;
  receipt_id UUID := gen_random_uuid();
  receipt_item_id UUID;
  supplier_bill_id UUID;
  bill_result JSONB;
  receipt_number TEXT;
  received_date_value DATE := COALESCE(NULLIF(p_payload->>'receivedDate', '')::DATE, CURRENT_DATE);
  due_date_value DATE := NULLIF(p_payload->>'dueDate', '')::DATE;
  total_value NUMERIC := 0;
  quantity_value NUMERIC;
  unit_cost_value NUMERIC;
  average_cost_value NUMERIC;
  subtotal_value NUMERIC;
  balance_row public.stock_balances%ROWTYPE;
BEGIN
  IF actor_role NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mencatat penerimaan stok';
  END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN
    RAISE EXCEPTION 'Penerimaan stok harus memiliki minimal satu produk';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]')) AS payload_item(item_value)
    GROUP BY payload_item.item_value->>'productId'
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Produk yang sama cukup dicatat satu kali dalam satu penerimaan';
  END IF;

  SELECT supplier.* INTO supplier_row
  FROM public.suppliers AS supplier
  WHERE supplier.id = (p_payload->>'supplierId')::UUID
    AND supplier.status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier aktif tidak ditemukan'; END IF;
  IF due_date_value IS NOT NULL AND due_date_value < received_date_value THEN
    RAISE EXCEPTION 'Jatuh tempo tidak boleh sebelum tanggal penerimaan';
  END IF;

  FOR item IN
    SELECT payload_item.item_value
    FROM jsonb_array_elements(p_payload->'items') AS payload_item(item_value)
  LOOP
    quantity_value := ROUND(COALESCE((item->>'quantity')::NUMERIC, 0), 3);
    unit_cost_value := ROUND(COALESCE((item->>'unitCost')::NUMERIC, 0), 2);
    IF quantity_value <= 0 OR unit_cost_value <= 0 THEN
      RAISE EXCEPTION 'Jumlah dan harga beli penerimaan harus lebih dari nol';
    END IF;

    SELECT product.* INTO product_row
    FROM public.products AS product
    WHERE product.id = (item->>'productId')::UUID
      AND product.status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    total_value := total_value + ROUND(quantity_value * unit_cost_value, 2);
  END LOOP;

  receipt_number := public.next_stock_receipt_number(TO_CHAR(received_date_value, 'YYYY/MM'));

  IF COALESCE((p_payload->>'createPayable')::BOOLEAN, FALSE) THEN
    bill_result := public.create_supplier_bill_transaction(jsonb_build_object(
      'supplierId', supplier_row.id,
      'supplierReference', p_payload->>'supplierReference',
      'billDate', received_date_value,
      'dueDate', p_payload->>'dueDate',
      'total', total_value,
      'notes', p_payload->>'notes'
    ));
    supplier_bill_id := (bill_result->>'supplierBillId')::UUID;
  END IF;

  INSERT INTO public.stock_receipts(
    id, receipt_number, supplier_id, supplier_bill_id, supplier_reference,
    received_date, total_cost, notes, created_by
  ) VALUES (
    receipt_id, receipt_number, supplier_row.id, supplier_bill_id,
    NULLIF(BTRIM(p_payload->>'supplierReference'), ''), received_date_value,
    total_value, NULLIF(BTRIM(p_payload->>'notes'), ''), auth.uid()
  );

  INSERT INTO public.stock_balances(product_id)
  SELECT DISTINCT (payload_item.item_value->>'productId')::UUID
  FROM jsonb_array_elements(p_payload->'items') AS payload_item(item_value)
  ON CONFLICT (product_id) DO NOTHING;

  PERFORM balance.product_id
  FROM public.stock_balances AS balance
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload->'items') AS payload_item(item_value)
    WHERE (payload_item.item_value->>'productId')::UUID = balance.product_id
  )
  ORDER BY balance.product_id
  FOR UPDATE;

  SELECT profile.full_name INTO actor_name
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid();

  FOR item IN
    SELECT payload_item.item_value
    FROM jsonb_array_elements(p_payload->'items') AS payload_item(item_value)
    ORDER BY payload_item.item_value->>'productId'
  LOOP
    quantity_value := ROUND((item->>'quantity')::NUMERIC, 3);
    unit_cost_value := ROUND((item->>'unitCost')::NUMERIC, 2);
    subtotal_value := ROUND(quantity_value * unit_cost_value, 2);

    SELECT product.* INTO product_row
    FROM public.products AS product
    WHERE product.id = (item->>'productId')::UUID;
    SELECT balance.* INTO balance_row
    FROM public.stock_balances AS balance
    WHERE balance.product_id = product_row.id
    FOR UPDATE;

    average_cost_value := ROUND(
      (
        (balance_row.quantity * balance_row.average_unit_cost)
        + (quantity_value * unit_cost_value)
      ) / (balance_row.quantity + quantity_value),
      2
    );

    UPDATE public.stock_balances AS balance
    SET quantity = balance.quantity + quantity_value,
        average_unit_cost = average_cost_value,
        updated_at = NOW()
    WHERE balance.product_id = product_row.id
    RETURNING balance.* INTO balance_row;

    receipt_item_id := gen_random_uuid();
    INSERT INTO public.stock_receipt_items(
      id, receipt_id, product_id, product_name_snapshot, unit, quantity, unit_cost, subtotal
    ) VALUES (
      receipt_item_id, receipt_id, product_row.id,
      product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      product_row.default_unit, quantity_value, unit_cost_value, subtotal_value
    );

    INSERT INTO public.stock_movements(
      product_id, product_name_snapshot, unit, movement_type, quantity_delta,
      balance_after, supplier_id, receipt_id, receipt_item_id, notes, occurred_at, created_by
    ) VALUES (
      product_row.id,
      product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      product_row.default_unit, 'PURCHASE_IN', quantity_value, balance_row.quantity,
      supplier_row.id, receipt_id, receipt_item_id, receipt_number, received_date_value, auth.uid()
    );

    -- Keep the incoming supplier price in stock_receipt_items and record the
    -- newly calculated moving average as the active HPP for invoices.
    PERFORM public.set_product_cost(
      product_row.id,
      supplier_row.id,
      average_cost_value,
      NOW(),
      'HPP rata-rata dari ' || receipt_number || '; harga supplier ' || unit_cost_value
    );
  END LOOP;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'stock_receipts', receipt_id, 'STOCK_RECEIPT_CREATED',
    jsonb_build_object(
      'receipt_number', receipt_number,
      'supplier_id', supplier_row.id,
      'total', total_value,
      'supplier_bill_id', supplier_bill_id,
      'cost_method', 'MOVING_WEIGHTED_AVERAGE'
    )
  );

  RETURN jsonb_build_object(
    'receiptId', receipt_id,
    'receiptNumber', receipt_number,
    'supplierBillId', supplier_bill_id,
    'total', total_value
  );
END;
$$;

REVOKE ALL ON FUNCTION public.next_stock_receipt_number(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stock_receipt_transaction(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_receipt_transaction(JSONB) TO authenticated;
