-- Safe load maintenance operations.
-- Loads become immutable once reconciliation or payment has started.

CREATE OR REPLACE FUNCTION public.update_load_transaction(p_load_id UUID, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  load_row public.loads%ROWTYPE;
  invoice_row public.invoices%ROWTYPE;
  item JSONB;
  cost JSONB;
  product_row public.products%ROWTYPE;
  destination_row public.customers%ROWTYPE;
  existing_bill RECORD;
  source_row RECORD;
  row_kg NUMERIC;
  purchase_total_value NUMERIC := 0;
  load_cost_total_value NUMERIC := 0;
  subtotal_value NUMERIC := 0;
  item_cost NUMERIC;
  item_selling_price NUMERIC;
  entered_selling_price NUMERIC;
  invoice_item_row RECORD;
  v_period_key TEXT;
  v_sequence_value INTEGER;
  actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER', 'FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mengubah muatan';
  END IF;

  SELECT * INTO load_row FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muatan tidak ditemukan'; END IF;
  IF load_row.status = 'RECONCILED' THEN
    RAISE EXCEPTION 'Muatan yang sudah direkonsiliasi tidak dapat diedit';
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

  IF load_row.invoice_id IS NOT NULL THEN
    SELECT * INTO invoice_row FROM public.invoices WHERE id = load_row.invoice_id FOR UPDATE;
    IF invoice_row.total_paid > 0 OR EXISTS (
      SELECT 1 FROM public.payments WHERE invoice_id = load_row.invoice_id
    ) THEN
      RAISE EXCEPTION 'Muatan tidak dapat diedit karena invoice sudah menerima pembayaran';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_bills WHERE load_id = p_load_id AND total_paid > 0) THEN
    RAISE EXCEPTION 'Muatan tidak dapat diedit karena hutang sumber sudah menerima pembayaran';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    row_kg := ROUND(COALESCE((item->>'quantity')::NUMERIC, 0) * CASE item->>'unit'
      WHEN 'GRAM' THEN 0.001 WHEN 'KG' THEN 1 WHEN 'TON' THEN 1000 ELSE 0 END, 3);
    IF row_kg <= 0 OR COALESCE((item->>'purchasePricePerKg')::NUMERIC, 0) <= 0 THEN
      RAISE EXCEPTION 'Berat dan harga beli per kg harus lebih dari nol';
    END IF;
    entered_selling_price := COALESCE((item->>'sellingPricePerKg')::NUMERIC, 0);
    IF entered_selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual pabrik per kg harus lebih dari nol'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = (item->>'sourceId')::UUID AND status = 'ACTIVE') THEN
      RAISE EXCEPTION 'TPI/sumber aktif tidak ditemukan';
    END IF;
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    purchase_total_value := purchase_total_value + ROUND(row_kg * (item->>'purchasePricePerKg')::NUMERIC, 2);
  END LOOP;

  FOR cost IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    IF COALESCE((cost->>'amount')::NUMERIC, 0) <= 0 OR NULLIF(BTRIM(cost->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'Biaya muatan tidak valid';
    END IF;
    load_cost_total_value := load_cost_total_value + ROUND((cost->>'amount')::NUMERIC, 2);
  END LOOP;

  -- Remove dependent supplier bills and recreate them from the edited rows.
  DELETE FROM public.supplier_bills WHERE load_id = p_load_id AND total_paid = 0;
  DELETE FROM public.load_items WHERE load_id = p_load_id;
  DELETE FROM public.load_costs WHERE load_id = p_load_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    row_kg := ROUND((item->>'quantity')::NUMERIC * CASE item->>'unit'
      WHEN 'GRAM' THEN 0.001 WHEN 'KG' THEN 1 WHEN 'TON' THEN 1000 ELSE 0 END, 3);
    INSERT INTO public.load_items(
      load_id, source_id, product_id, product_name_snapshot, product_size_snapshot,
      input_quantity, input_unit, quantity_kg, purchase_price_per_kg,
      selling_price_per_kg, purchase_total, notes
    )
    SELECT p_load_id, (item->>'sourceId')::UUID, p.id, p.name, p.size,
      (item->>'quantity')::NUMERIC, item->>'unit', row_kg,
      ROUND((item->>'purchasePricePerKg')::NUMERIC, 2),
      ROUND((item->>'sellingPricePerKg')::NUMERIC, 2),
      ROUND(row_kg * (item->>'purchasePricePerKg')::NUMERIC, 2),
      NULLIF(BTRIM(item->>'notes'), '')
    FROM public.products p WHERE p.id = (item->>'productId')::UUID;
  END LOOP;

  FOR cost IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    INSERT INTO public.load_costs(load_id, category, name, amount, notes)
    VALUES (p_load_id, cost->>'category', LEFT(BTRIM(cost->>'name'), 120),
      ROUND((cost->>'amount')::NUMERIC, 2), NULLIF(BTRIM(cost->>'notes'), ''));
  END LOOP;

  v_period_key := TO_CHAR(COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, load_row.load_date), 'YYYY/MM');
  FOR source_row IN
    SELECT li.source_id, ROUND(SUM(li.purchase_total), 2) AS total
    FROM public.load_items li WHERE li.load_id = p_load_id GROUP BY li.source_id
  LOOP
    INSERT INTO public.supplier_bill_number_sequences AS bill_sequence(period_key, last_value)
    VALUES (v_period_key, 1)
    ON CONFLICT (period_key) DO UPDATE SET last_value = bill_sequence.last_value + 1, updated_at = NOW()
    RETURNING bill_sequence.last_value INTO v_sequence_value;
    INSERT INTO public.supplier_bills(
      bill_number, supplier_id, load_id, bill_date, due_date, status, total,
      total_paid, remaining_balance, notes, created_by
    ) VALUES (
      'HTG/' || v_period_key || '/' || LPAD(v_sequence_value::TEXT, 4, '0'),
      source_row.source_id, p_load_id,
      COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, load_row.load_date),
      COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, load_row.load_date) + 7,
      'OPEN', source_row.total, 0, source_row.total,
      'Pembelian pada ' || load_row.load_number, auth.uid()
    );
  END LOOP;

  -- Rebuild the unpaid factory invoice items using the edited selling prices.
  IF invoice_row.id IS NOT NULL THEN
    DELETE FROM public.invoice_items WHERE invoice_id = invoice_row.id;
    FOR source_row IN
      SELECT li.product_id, li.product_name_snapshot,
        ROUND(SUM(li.quantity_kg), 3) AS quantity_kg,
        ROUND(SUM(li.purchase_total) / NULLIF(SUM(li.quantity_kg), 0), 2) AS cost,
        MAX(li.selling_price_per_kg) AS selling_price
      FROM public.load_items li WHERE li.load_id = p_load_id
      GROUP BY li.product_id, li.product_name_snapshot
    LOOP
      item_selling_price := source_row.selling_price;
      subtotal_value := subtotal_value + ROUND(source_row.quantity_kg * item_selling_price, 2);
      item_cost := ROUND(source_row.quantity_kg * source_row.cost, 2);
      INSERT INTO public.invoice_items(
        invoice_id, product_id, description_snapshot, quantity, margin_quantity,
        unit, selling_price_snapshot, purchase_price_snapshot, subtotal,
        product_cost_total, profit
      ) VALUES (
        invoice_row.id, source_row.product_id, source_row.product_name_snapshot,
        source_row.quantity_kg, 0, 'kg', item_selling_price, source_row.cost,
        ROUND(source_row.quantity_kg * item_selling_price, 2), item_cost,
        ROUND(source_row.quantity_kg * item_selling_price, 2) - item_cost
      );
    END LOOP;
    UPDATE public.invoices
    SET customer_id = destination_row.id,
        issue_date = COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, load_row.load_date),
        due_date = COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, load_row.load_date) + destination_row.payment_term_days,
        subtotal = subtotal_value, total = subtotal_value,
        remaining_balance = subtotal_value,
        total_product_cost = (SELECT COALESCE(SUM(ii.product_cost_total), 0) FROM public.invoice_items ii WHERE ii.invoice_id = invoice_row.id),
        product_profit = subtotal_value - (SELECT COALESCE(SUM(ii.product_cost_total), 0) FROM public.invoice_items ii WHERE ii.invoice_id = invoice_row.id),
        transaction_profit = subtotal_value - (SELECT COALESCE(SUM(ii.product_cost_total), 0) FROM public.invoice_items ii WHERE ii.invoice_id = invoice_row.id) - load_cost_total_value,
        transaction_margin = CASE WHEN subtotal_value = 0 THEN 0 ELSE ROUND((subtotal_value - (SELECT COALESCE(SUM(ii.product_cost_total), 0) FROM public.invoice_items ii WHERE ii.invoice_id = invoice_row.id) - load_cost_total_value) / subtotal_value * 100, 2) END,
        updated_at = NOW()
    WHERE id = invoice_row.id;
  END IF;

  UPDATE public.loads
  SET load_date = COALESCE(NULLIF(p_payload->>'loadDate', '')::DATE, load_row.load_date),
      destination_id = destination_row.id,
      invoice_basis = COALESCE((p_payload->>'invoiceBasis')::public.load_invoice_basis, load_row.invoice_basis),
      total_quantity_kg = (SELECT COALESCE(SUM(li.quantity_kg), 0) FROM public.load_items li WHERE li.load_id = p_load_id),
      total_purchase_cost = purchase_total_value,
      total_load_cost = load_cost_total_value,
      notes = NULLIF(BTRIM(p_payload->>'notes'), ''),
      updated_at = NOW()
  WHERE id = p_load_id;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'loads', p_load_id, 'LOAD_UPDATED',
    jsonb_build_object('load_number', load_row.load_number));

  RETURN jsonb_build_object('loadId', p_load_id, 'loadNumber', load_row.load_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_load_transaction(p_load_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  load_row public.loads%ROWTYPE;
  invoice_row public.invoices%ROWTYPE;
  actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER', 'FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menghapus muatan';
  END IF;
  SELECT * INTO load_row FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muatan tidak ditemukan'; END IF;
  IF load_row.status = 'RECONCILED' THEN
    RAISE EXCEPTION 'Muatan yang sudah direkonsiliasi tidak dapat dihapus';
  END IF;
  IF load_row.invoice_id IS NOT NULL THEN
    SELECT * INTO invoice_row FROM public.invoices WHERE id = load_row.invoice_id FOR UPDATE;
    IF invoice_row.total_paid > 0 OR EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = load_row.invoice_id) THEN
      RAISE EXCEPTION 'Muatan tidak dapat dihapus karena invoice sudah menerima pembayaran';
    END IF;
    IF EXISTS (SELECT 1 FROM public.supplier_bills WHERE load_id = p_load_id AND total_paid > 0) THEN
      RAISE EXCEPTION 'Muatan tidak dapat dihapus karena hutang sumber sudah menerima pembayaran';
    END IF;
    UPDATE public.loads SET invoice_id = NULL WHERE id = p_load_id;
    DELETE FROM public.payments WHERE invoice_id = invoice_row.id;
    DELETE FROM public.invoices WHERE id = invoice_row.id;
  END IF;
  DELETE FROM public.supplier_bills WHERE load_id = p_load_id AND total_paid = 0;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'loads', p_load_id, 'LOAD_DELETED',
    jsonb_build_object('load_number', load_row.load_number));
  DELETE FROM public.loads WHERE id = p_load_id;
  RETURN jsonb_build_object('loadNumber', load_row.load_number);
END;
$$;

REVOKE ALL ON FUNCTION public.update_load_transaction(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_load_transaction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_load_transaction(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_load_transaction(UUID) TO authenticated;
