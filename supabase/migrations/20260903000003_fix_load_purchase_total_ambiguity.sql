-- Fix PostgreSQL 42702 caused by the PL/pgSQL variable purchase_total
-- conflicting with load_items.purchase_total.

CREATE OR REPLACE FUNCTION public.create_load_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  load_id_value UUID := gen_random_uuid();
  load_number_value TEXT;
  invoice_id_value UUID := gen_random_uuid();
  invoice_number_value TEXT;
  source_row RECORD;
  item JSONB;
  product_row public.products%ROWTYPE;
  destination_row public.customers%ROWTYPE;
  load_date_value DATE := COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, CURRENT_DATE);
  basis public.load_invoice_basis := COALESCE((p_payload->>'invoiceBasis')::public.load_invoice_basis, 'DEPARTURE');
  total_kg NUMERIC := 0;
  v_purchase_total NUMERIC := 0;
  load_cost_total NUMERIC := 0;
  row_kg NUMERIC;
  row_price NUMERIC;
  row_total NUMERIC;
  subtotal_value NUMERIC := 0;
  invoice_item_id UUID;
  selling_price NUMERIC;
  v_period_key TEXT;
  v_sequence_value INTEGER;
  actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER', 'FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat membuat muatan';
  END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN
    RAISE EXCEPTION 'Muatan harus memiliki minimal satu item';
  END IF;

  SELECT * INTO destination_row
  FROM public.customers
  WHERE id = (p_payload->>'destinationId')::UUID
    AND status = 'ACTIVE'
    AND buyer_type = 'PABRIK';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pabrik tujuan aktif tidak ditemukan'; END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    row_kg := ROUND(
      COALESCE((item->>'quantity')::NUMERIC, 0) *
      CASE item->>'unit'
        WHEN 'GRAM' THEN 0.001
        WHEN 'KG' THEN 1
        WHEN 'TON' THEN 1000
        ELSE 0
      END,
      3
    );
    row_price := ROUND(COALESCE((item->>'purchasePricePerKg')::NUMERIC, 0), 2);
    IF row_kg <= 0 OR row_price <= 0 THEN
      RAISE EXCEPTION 'Berat dan harga beli per kg harus lebih dari nol';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.suppliers
      WHERE id = (item->>'sourceId')::UUID AND status = 'ACTIVE'
    ) THEN
      RAISE EXCEPTION 'TPI/sumber aktif tidak ditemukan';
    END IF;
    SELECT * INTO product_row
    FROM public.products
    WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    total_kg := total_kg + row_kg;
    row_total := ROUND(row_kg * row_price, 2);
    v_purchase_total := v_purchase_total + row_total;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    IF COALESCE((item->>'amount')::NUMERIC, 0) <= 0
      OR NULLIF(BTRIM(item->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'Biaya muatan tidak valid';
    END IF;
    load_cost_total := load_cost_total + ROUND((item->>'amount')::NUMERIC, 2);
  END LOOP;

  load_number_value := public.next_gala_load_number(load_date_value);
  v_period_key := TO_CHAR(load_date_value, 'YYYY/MM');

  INSERT INTO public.invoice_number_sequences AS invoice_sequence (period_key, last_value)
  VALUES (v_period_key, 1)
  ON CONFLICT (period_key) DO UPDATE
    SET last_value = invoice_sequence.last_value + 1,
        updated_at = NOW()
  RETURNING invoice_sequence.last_value INTO v_sequence_value;
  invoice_number_value := 'INV/' || v_period_key || '/' || LPAD(v_sequence_value::TEXT, 4, '0');

  INSERT INTO public.invoices(
    id, public_token, invoice_number, customer_id, issue_date, due_date, status,
    subtotal, discount, total, total_paid, remaining_balance, total_product_cost,
    total_direct_cost, product_profit, transaction_profit, transaction_margin,
    notes, created_by, invoice_type, load_id, invoice_basis, is_estimate
  ) VALUES (
    invoice_id_value, gen_random_uuid(), invoice_number_value, destination_row.id,
    load_date_value, load_date_value + destination_row.payment_term_days, 'ISSUED',
    0, 0, 0, 0, 0, 0, load_cost_total, 0, -load_cost_total, 0,
    NULLIF(BTRIM(p_payload->>'notes'), ''), auth.uid(), 'FACTORY_LOAD',
    load_id_value, basis, basis = 'ACCEPTED'
  );

  INSERT INTO public.loads(
    id, load_number, load_date, destination_id, invoice_basis, status,
    total_quantity_kg, total_purchase_cost, total_load_cost, notes,
    dispatched_at, created_by
  ) VALUES (
    load_id_value, load_number_value, load_date_value, destination_row.id, basis,
    'DISPATCHED', total_kg, v_purchase_total, load_cost_total,
    NULLIF(BTRIM(p_payload->>'notes'), ''), NOW(), auth.uid()
  );

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    row_kg := ROUND(
      (item->>'quantity')::NUMERIC *
      CASE item->>'unit'
        WHEN 'GRAM' THEN 0.001
        WHEN 'KG' THEN 1
        WHEN 'TON' THEN 1000
        ELSE 0
      END,
      3
    );
    row_price := ROUND((item->>'purchasePricePerKg')::NUMERIC, 2);
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID;
    INSERT INTO public.load_items(
      load_id, source_id, product_id, product_name_snapshot, product_size_snapshot,
      input_quantity, input_unit, quantity_kg, purchase_price_per_kg,
      purchase_total, notes
    ) VALUES (
      load_id_value, (item->>'sourceId')::UUID, product_row.id, product_row.name,
      product_row.size, (item->>'quantity')::NUMERIC, item->>'unit', row_kg,
      row_price, ROUND(row_kg * row_price, 2), NULLIF(BTRIM(item->>'notes'), '')
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    INSERT INTO public.load_costs(load_id, category, name, amount, notes)
    VALUES (
      load_id_value, item->>'category', LEFT(BTRIM(item->>'name'), 120),
      ROUND((item->>'amount')::NUMERIC, 2), NULLIF(BTRIM(item->>'notes'), '')
    );
  END LOOP;

  FOR source_row IN
    SELECT li.source_id, ROUND(SUM(li.purchase_total), 2) AS total
    FROM public.load_items AS li
    WHERE li.load_id = load_id_value
    GROUP BY li.source_id
  LOOP
    INSERT INTO public.supplier_bill_number_sequences AS bill_sequence (period_key, last_value)
    VALUES (v_period_key, 1)
    ON CONFLICT (period_key) DO UPDATE
      SET last_value = bill_sequence.last_value + 1,
          updated_at = NOW()
    RETURNING bill_sequence.last_value INTO v_sequence_value;

    INSERT INTO public.supplier_bills(
      bill_number, supplier_id, load_id, bill_date, due_date, status, total,
      total_paid, remaining_balance, notes, created_by
    ) VALUES (
      'HTG/' || v_period_key || '/' || LPAD(v_sequence_value::TEXT, 4, '0'),
      source_row.source_id, load_id_value, load_date_value, load_date_value + 7,
      'OPEN', source_row.total, 0, source_row.total,
      'Pembelian pada ' || load_number_value, auth.uid()
    );
  END LOOP;

  FOR source_row IN
    SELECT li.product_id, li.product_name_snapshot,
      ROUND(SUM(li.quantity_kg), 3) AS quantity_kg,
      ROUND(SUM(li.purchase_total) / NULLIF(SUM(li.quantity_kg), 0), 2) AS cost
    FROM public.load_items AS li
    WHERE li.load_id = load_id_value
    GROUP BY li.product_id, li.product_name_snapshot
  LOOP
    SELECT COALESCE(
      (
        SELECT cp.selling_price
        FROM public.customer_prices AS cp
        WHERE cp.customer_id = destination_row.id
          AND cp.product_id = source_row.product_id
          AND cp.ended_at IS NULL
        ORDER BY cp.effective_at DESC
        LIMIT 1
      ),
      p.default_selling_price
    ) INTO selling_price
    FROM public.products AS p
    WHERE p.id = source_row.product_id;
    IF selling_price IS NULL OR selling_price <= 0 THEN
      RAISE EXCEPTION 'Harga jual % belum tersedia', source_row.product_name_snapshot;
    END IF;

    subtotal_value := subtotal_value + ROUND(source_row.quantity_kg * selling_price, 2);
    invoice_item_id := gen_random_uuid();
    INSERT INTO public.invoice_items(
      id, invoice_id, product_id, description_snapshot, quantity, margin_quantity,
      unit, selling_price_snapshot, purchase_price_snapshot, subtotal,
      product_cost_total, profit
    ) VALUES (
      invoice_item_id, invoice_id_value, source_row.product_id,
      source_row.product_name_snapshot, source_row.quantity_kg, 0, 'kg',
      selling_price, source_row.cost, ROUND(source_row.quantity_kg * selling_price, 2),
      ROUND(source_row.quantity_kg * source_row.cost, 2),
      ROUND(source_row.quantity_kg * (selling_price - source_row.cost), 2)
    );
  END LOOP;

  UPDATE public.invoices
  SET subtotal = subtotal_value,
      total = subtotal_value,
      remaining_balance = subtotal_value,
      total_product_cost = (
        SELECT ROUND(COALESCE(SUM(ii.product_cost_total), 0), 2)
        FROM public.invoice_items AS ii
        WHERE ii.invoice_id = invoice_id_value
      ),
      product_profit = subtotal_value - (
        SELECT ROUND(COALESCE(SUM(ii.product_cost_total), 0), 2)
        FROM public.invoice_items AS ii
        WHERE ii.invoice_id = invoice_id_value
      ),
      transaction_profit = subtotal_value - (
        SELECT ROUND(COALESCE(SUM(ii.product_cost_total), 0), 2)
        FROM public.invoice_items AS ii
        WHERE ii.invoice_id = invoice_id_value
      ) - load_cost_total,
      transaction_margin = CASE
        WHEN subtotal_value = 0 THEN 0
        ELSE ROUND((
          subtotal_value - (
            SELECT COALESCE(SUM(ii.product_cost_total), 0)
            FROM public.invoice_items AS ii
            WHERE ii.invoice_id = invoice_id_value
          ) - load_cost_total
        ) / subtotal_value * 100, 2)
      END,
      updated_at = NOW()
  WHERE id = invoice_id_value;

  UPDATE public.loads
  SET invoice_id = invoice_id_value, status = 'DISPATCHED', updated_at = NOW()
  WHERE id = load_id_value;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'loads', load_id_value,
    'LOAD_DISPATCHED',
    jsonb_build_object(
      'load_number', load_number_value,
      'total_kg', total_kg,
      'invoice_number', invoice_number_value
    )
  );

  RETURN jsonb_build_object(
    'loadId', load_id_value,
    'loadNumber', load_number_value,
    'invoiceId', invoice_id_value,
    'invoiceNumber', invoice_number_value,
    'totalKg', total_kg
  );
END;
$$;
