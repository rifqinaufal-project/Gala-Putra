-- Unify inventory, pricing, inventory capital, and profit calculations.
-- Purchase receipts use a perpetual weighted-average cost. Stock opname sets
-- an absolute target balance instead of treating user input as a delta.

ALTER TABLE public.stock_balances
  ADD COLUMN IF NOT EXISTS average_unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0
  CHECK (average_unit_cost >= 0);

-- Initialize existing balances from the last active HPP. From this migration
-- onward, every receipt maintains the moving average atomically.
UPDATE public.stock_balances sb
SET average_unit_cost = COALESCE((
  SELECT pc.unit_cost
  FROM public.product_costs pc
  WHERE pc.product_id = sb.product_id
    AND pc.effective_at <= NOW()
    AND (pc.ended_at IS NULL OR pc.ended_at > NOW())
  ORDER BY pc.effective_at DESC
  LIMIT 1
), 0)
WHERE sb.average_unit_cost = 0;

CREATE OR REPLACE FUNCTION public.set_product_average_cost(
  p_product_id UUID,
  p_supplier_id UUID,
  p_unit_cost NUMERIC,
  p_effective_at TIMESTAMPTZ DEFAULT NOW(),
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cost_id UUID;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Akses harga beli ditolak';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 THEN
    RAISE EXCEPTION 'Harga beli rata-rata harus lebih dari nol';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Produk tidak ditemukan';
  END IF;

  INSERT INTO public.stock_balances(product_id)
  VALUES (p_product_id)
  ON CONFLICT (product_id) DO NOTHING;

  UPDATE public.stock_balances
  SET average_unit_cost = ROUND(p_unit_cost, 2), updated_at = NOW()
  WHERE product_id = p_product_id;

  cost_id := public.set_product_cost(
    p_product_id,
    p_supplier_id,
    ROUND(p_unit_cost, 2),
    COALESCE(p_effective_at, NOW()),
    p_notes
  );
  RETURN cost_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_stock_count_transaction(
  p_product_id UUID,
  p_target_quantity NUMERIC,
  p_minimum_quantity NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  balance_row public.stock_balances%ROWTYPE;
  target_quantity_value NUMERIC := ROUND(COALESCE(p_target_quantity, -1), 3);
  minimum_quantity_value NUMERIC := ROUND(COALESCE(p_minimum_quantity, -1), 3);
  quantity_delta_value NUMERIC;
  movement_type_value public.stock_movement_type;
  actor_name TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menyesuaikan stok';
  END IF;
  IF target_quantity_value < 0 THEN RAISE EXCEPTION 'Stok aktual tidak boleh negatif'; END IF;
  IF minimum_quantity_value < 0 THEN RAISE EXCEPTION 'Stok minimum tidak boleh negatif'; END IF;

  SELECT * INTO product_row FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  INSERT INTO public.stock_balances(product_id)
  VALUES (p_product_id)
  ON CONFLICT (product_id) DO NOTHING;

  SELECT * INTO balance_row
  FROM public.stock_balances
  WHERE product_id = p_product_id
  FOR UPDATE;

  quantity_delta_value := target_quantity_value - balance_row.quantity;
  IF quantity_delta_value <> 0 AND NULLIF(BTRIM(p_notes), '') IS NULL THEN
    RAISE EXCEPTION 'Alasan perubahan stok wajib diisi';
  END IF;

  UPDATE public.stock_balances
  SET quantity = target_quantity_value,
      minimum_quantity = minimum_quantity_value,
      updated_at = NOW()
  WHERE product_id = p_product_id;

  IF quantity_delta_value <> 0 THEN
    movement_type_value := CASE
      WHEN quantity_delta_value > 0 THEN 'ADJUSTMENT_IN'::public.stock_movement_type
      ELSE 'ADJUSTMENT_OUT'::public.stock_movement_type
    END;

    INSERT INTO public.stock_movements(
      product_id, product_name_snapshot, unit, movement_type, quantity_delta,
      balance_after, notes, occurred_at, created_by
    ) VALUES (
      p_product_id,
      product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      product_row.default_unit,
      movement_type_value,
      quantity_delta_value,
      target_quantity_value,
      BTRIM(p_notes),
      NOW(),
      auth.uid()
    );
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'stock_balances', p_product_id, 'STOCK_COUNT_SET',
    jsonb_build_object(
      'quantity_before', balance_row.quantity,
      'quantity_after', target_quantity_value,
      'quantity_delta', quantity_delta_value,
      'minimum_before', balance_row.minimum_quantity,
      'minimum_after', minimum_quantity_value,
      'notes', NULLIF(BTRIM(p_notes), '')
    )
  );

  RETURN jsonb_build_object(
    'quantity', target_quantity_value,
    'minimumQuantity', minimum_quantity_value,
    'quantityDelta', quantity_delta_value
  );
END;
$$;

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
  period_key TEXT;
  sequence_value INTEGER;
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
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]')) item_value
    GROUP BY item_value->>'productId' HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Produk yang sama cukup dicatat satu kali dalam satu penerimaan';
  END IF;

  SELECT * INTO supplier_row FROM public.suppliers
  WHERE id = (p_payload->>'supplierId')::UUID AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier aktif tidak ditemukan'; END IF;
  IF due_date_value IS NOT NULL AND due_date_value < received_date_value THEN
    RAISE EXCEPTION 'Jatuh tempo tidak boleh sebelum tanggal penerimaan';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    quantity_value := ROUND(COALESCE((item->>'quantity')::NUMERIC, 0), 3);
    unit_cost_value := ROUND(COALESCE((item->>'unitCost')::NUMERIC, 0), 2);
    IF quantity_value <= 0 OR unit_cost_value <= 0 THEN
      RAISE EXCEPTION 'Jumlah dan harga beli penerimaan harus lebih dari nol';
    END IF;
    SELECT * INTO product_row FROM public.products
    WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    total_value := total_value + ROUND(quantity_value * unit_cost_value, 2);
  END LOOP;

  period_key := TO_CHAR(received_date_value, 'YYYY/MM');
  INSERT INTO public.stock_receipt_number_sequences(period_key, last_value)
  VALUES (period_key, 1)
  ON CONFLICT (period_key) DO UPDATE
    SET last_value = public.stock_receipt_number_sequences.last_value + 1,
        updated_at = NOW()
  RETURNING last_value INTO sequence_value;
  receipt_number := 'RCV/' || period_key || '/' || LPAD(sequence_value::TEXT, 4, '0');

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
  SELECT DISTINCT (value->>'productId')::UUID
  FROM jsonb_array_elements(p_payload->'items')
  ON CONFLICT (product_id) DO NOTHING;

  PERFORM sb.product_id
  FROM public.stock_balances sb
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payload->'items') receipt_item
    WHERE (receipt_item->>'productId')::UUID = sb.product_id
  )
  ORDER BY sb.product_id
  FOR UPDATE;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'productId' LOOP
    quantity_value := ROUND((item->>'quantity')::NUMERIC, 3);
    unit_cost_value := ROUND((item->>'unitCost')::NUMERIC, 2);
    subtotal_value := ROUND(quantity_value * unit_cost_value, 2);

    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID;
    SELECT * INTO balance_row FROM public.stock_balances WHERE product_id = product_row.id FOR UPDATE;

    average_cost_value := ROUND(
      (
        (balance_row.quantity * balance_row.average_unit_cost)
        + (quantity_value * unit_cost_value)
      ) / (balance_row.quantity + quantity_value),
      2
    );

    UPDATE public.stock_balances
    SET quantity = quantity + quantity_value,
        average_unit_cost = average_cost_value,
        updated_at = NOW()
    WHERE product_id = product_row.id
    RETURNING * INTO balance_row;

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

    -- product_costs remains the immutable HPP history consumed by invoices.
    -- The raw supplier price remains on stock_receipt_items.
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

-- Repair historical rows whose header totals drifted from their immutable
-- invoice item snapshots. For old zero-HPP items, recover the HPP that was
-- effective on the invoice date when one is available.
WITH recovered_costs AS (
  SELECT
    ii.id,
    COALESCE(
      (
        SELECT pc.unit_cost
        FROM public.product_costs pc
        WHERE pc.product_id = ii.product_id
          AND pc.effective_at < (inv.issue_date + 1)::TIMESTAMPTZ
        ORDER BY pc.effective_at DESC
        LIMIT 1
      ),
      NULLIF(sb.average_unit_cost, 0),
      0
    ) AS recovered_unit_cost
  FROM public.invoice_items ii
  JOIN public.invoices inv ON inv.id = ii.invoice_id
  LEFT JOIN public.stock_balances sb ON sb.product_id = ii.product_id
  WHERE ii.purchase_price_snapshot <= 0
)
UPDATE public.invoice_items ii
SET purchase_price_snapshot = ROUND(rc.recovered_unit_cost, 2),
    product_cost_total = ROUND(ii.quantity * rc.recovered_unit_cost, 2),
    profit = ii.subtotal - ROUND(ii.quantity * rc.recovered_unit_cost, 2)
FROM recovered_costs rc
WHERE rc.id = ii.id AND rc.recovered_unit_cost > 0;

UPDATE public.invoice_items
SET product_cost_total = ROUND(quantity * purchase_price_snapshot, 2),
    profit = subtotal - ROUND(quantity * purchase_price_snapshot, 2);

WITH invoice_totals AS (
  SELECT
    inv.id,
    COALESCE((SELECT SUM(ii.product_cost_total) FROM public.invoice_items ii WHERE ii.invoice_id = inv.id), 0) AS product_cost,
    COALESCE((SELECT SUM(dc.amount) FROM public.invoice_direct_costs dc WHERE dc.invoice_id = inv.id), 0) AS direct_cost
  FROM public.invoices inv
)
UPDATE public.invoices inv
SET total_product_cost = totals.product_cost,
    total_direct_cost = totals.direct_cost,
    product_profit = inv.total - totals.product_cost,
    transaction_profit = inv.total - totals.product_cost - totals.direct_cost,
    transaction_margin = CASE
      WHEN inv.total = 0 THEN 0
      ELSE ROUND(((inv.total - totals.product_cost - totals.direct_cost) / inv.total) * 100, 2)
    END,
    updated_at = NOW()
FROM invoice_totals totals
WHERE totals.id = inv.id;

REVOKE ALL ON FUNCTION public.set_product_average_cost(UUID, UUID, NUMERIC, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_stock_count_transaction(UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_stock_receipt_transaction(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_average_cost(UUID, UUID, NUMERIC, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_count_transaction(UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_receipt_transaction(JSONB) TO authenticated;
