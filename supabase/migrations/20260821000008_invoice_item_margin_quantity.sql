ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS margin_quantity NUMERIC(10, 3) NOT NULL DEFAULT 0
  CHECK (margin_quantity >= 0);

CREATE OR REPLACE FUNCTION public.create_invoice_transaction(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_role public.user_role := public.current_user_role(); actor_name TEXT;
  invoice_id UUID := gen_random_uuid(); token UUID := gen_random_uuid();
  customer_row public.customers%ROWTYPE; product_row public.products%ROWTYPE;
  item JSONB; cost JSONB; quantity_value NUMERIC; margin_value NUMERIC; billing_quantity NUMERIC;
  selling_price NUMERIC; purchase_price NUMERIC; requested_purchase_price NUMERIC;
  item_subtotal NUMERIC; item_cost NUMERIC; subtotal_value NUMERIC := 0; product_cost_value NUMERIC := 0;
  direct_cost_value NUMERIC := 0; discount_value NUMERIC := COALESCE((p_payload->>'discount')::NUMERIC, 0);
  total_value NUMERIC; product_profit_value NUMERIC; transaction_profit_value NUMERIC; margin_percent NUMERIC;
  requested_status public.invoice_status; issue_date_value DATE := COALESCE((p_payload->>'issueDate')::DATE, CURRENT_DATE);
  due_date_value DATE; invoice_number_value TEXT; sequence_value INTEGER; period_key_value TEXT;
BEGIN
  IF actor_role IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;
  requested_status := COALESCE((p_payload->>'status')::public.invoice_status, 'DRAFT');
  IF requested_status NOT IN ('DRAFT', 'ISSUED') THEN RAISE EXCEPTION 'Status invoice tidak valid'; END IF;
  IF actor_role = 'STAFF' AND requested_status <> 'DRAFT' THEN RAISE EXCEPTION 'Staff hanya dapat membuat draft'; END IF;
  IF discount_value < 0 THEN RAISE EXCEPTION 'Diskon tidak boleh negatif'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN RAISE EXCEPTION 'Invoice harus memiliki item'; END IF;
  SELECT * INTO customer_row FROM public.customers WHERE id = (p_payload->>'customerId')::UUID AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Restoran aktif tidak ditemukan'; END IF;
  due_date_value := COALESCE((p_payload->>'dueDate')::DATE, issue_date_value + customer_row.payment_term_days);
  IF due_date_value < issue_date_value THEN RAISE EXCEPTION 'Jatuh tempo tidak boleh sebelum tanggal invoice'; END IF;
  IF requested_status = 'ISSUED' THEN
    period_key_value := TO_CHAR(issue_date_value, 'YYYY/MM');
    INSERT INTO public.invoice_number_sequences(period_key, last_value) VALUES (period_key_value, 1)
    ON CONFLICT (period_key) DO UPDATE SET last_value = public.invoice_number_sequences.last_value + 1, updated_at = NOW()
    RETURNING last_value INTO sequence_value;
    invoice_number_value := 'INV/' || period_key_value || '/' || LPAD(sequence_value::TEXT, 4, '0');
  END IF;
  INSERT INTO public.invoices(id, public_token, invoice_number, customer_id, issue_date, due_date, status, subtotal, discount, total, total_paid, remaining_balance, total_product_cost, total_direct_cost, product_profit, transaction_profit, transaction_margin, notes, created_by)
  VALUES (invoice_id, token, invoice_number_value, customer_row.id, issue_date_value, due_date_value, requested_status, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULLIF(BTRIM(p_payload->>'notes'), ''), auth.uid());
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    quantity_value := (item->>'quantity')::NUMERIC; margin_value := ROUND(COALESCE((item->>'marginQuantity')::NUMERIC, 0), 3); billing_quantity := quantity_value + margin_value;
    IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Jumlah item harus lebih dari nol'; END IF;
    IF margin_value < 0 THEN RAISE EXCEPTION 'Margin item tidak boleh negatif'; END IF;
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    SELECT cp.selling_price INTO selling_price FROM public.customer_prices cp WHERE cp.customer_id = customer_row.id AND cp.product_id = product_row.id AND cp.effective_at <= NOW() AND (cp.ended_at IS NULL OR cp.ended_at > NOW()) ORDER BY cp.effective_at DESC LIMIT 1;
    selling_price := COALESCE(selling_price, product_row.default_selling_price);
    IF selling_price IS NULL OR selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual produk belum tersedia'; END IF;
    IF actor_role IN ('OWNER','FINANCE') AND item ? 'purchasePrice' AND NULLIF(BTRIM(item->>'purchasePrice'), '') IS NOT NULL THEN
      requested_purchase_price := (item->>'purchasePrice')::NUMERIC; IF requested_purchase_price <= 0 THEN RAISE EXCEPTION 'Harga beli invoice harus lebih dari nol'; END IF; purchase_price := ROUND(requested_purchase_price, 2);
    ELSE
      SELECT pc.unit_cost INTO purchase_price FROM public.product_costs pc WHERE pc.product_id = product_row.id AND pc.effective_at <= NOW() AND (pc.ended_at IS NULL OR pc.ended_at > NOW()) ORDER BY pc.effective_at DESC LIMIT 1;
    END IF;
    IF purchase_price IS NULL OR purchase_price <= 0 THEN RAISE EXCEPTION 'HPP aktif produk belum tersedia dan harga beli invoice belum diisi'; END IF;
    item_subtotal := ROUND(billing_quantity * selling_price, 2); item_cost := ROUND(quantity_value * purchase_price, 2);
    subtotal_value := subtotal_value + item_subtotal; product_cost_value := product_cost_value + item_cost;
    INSERT INTO public.invoice_items(id, invoice_id, product_id, description_snapshot, quantity, margin_quantity, unit, selling_price_snapshot, purchase_price_snapshot, subtotal, product_cost_total, profit)
    VALUES (gen_random_uuid(), invoice_id, product_row.id, product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END, quantity_value, margin_value, product_row.default_unit, selling_price, purchase_price, item_subtotal, item_cost, item_subtotal - item_cost);
  END LOOP;
  FOR cost IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    IF COALESCE((cost->>'amount')::NUMERIC, 0) <= 0 THEN RAISE EXCEPTION 'Biaya internal harus lebih dari nol'; END IF;
    direct_cost_value := direct_cost_value + (cost->>'amount')::NUMERIC;
    INSERT INTO public.invoice_direct_costs(id, invoice_id, category, name, amount, notes) VALUES (gen_random_uuid(), invoice_id, (cost->>'category')::public.direct_cost_category, LEFT(BTRIM(cost->>'name'), 120), (cost->>'amount')::NUMERIC, NULLIF(BTRIM(cost->>'notes'), ''));
  END LOOP;
  IF discount_value > subtotal_value THEN RAISE EXCEPTION 'Diskon melebihi subtotal'; END IF;
  total_value := subtotal_value - discount_value; product_profit_value := total_value - product_cost_value; transaction_profit_value := product_profit_value - direct_cost_value; margin_percent := CASE WHEN total_value = 0 THEN 0 ELSE ROUND(transaction_profit_value / total_value * 100, 2) END;
  UPDATE public.invoices SET subtotal = subtotal_value, discount = discount_value, total = total_value, remaining_balance = total_value, total_product_cost = product_cost_value, total_direct_cost = direct_cost_value, product_profit = product_profit_value, transaction_profit = transaction_profit_value, transaction_margin = margin_percent, updated_at = NOW() WHERE id = invoice_id;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload) VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', invoice_id, 'INVOICE_CREATED', jsonb_build_object('status', requested_status, 'total', total_value, 'invoice_number', invoice_number_value));
  RETURN jsonb_build_object('invoiceId', invoice_id, 'invoiceNumber', invoice_number_value, 'publicToken', token);
END; $$;

REVOKE ALL ON FUNCTION public.create_invoice_transaction(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_transaction(JSONB) TO authenticated;

-- Keep invoice edits consistent with creation: margin is billed but does not
-- increase the quantity used by stock movements.
CREATE OR REPLACE FUNCTION public.update_invoice_transaction(p_invoice_id UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_role public.user_role := public.current_user_role(); inv_row public.invoices%ROWTYPE; customer_row public.customers%ROWTYPE; product_row public.products%ROWTYPE;
  item JSONB; cost JSONB; quantity_value NUMERIC; margin_value NUMERIC; billing_quantity NUMERIC; selling_price NUMERIC; purchase_price NUMERIC; item_subtotal NUMERIC; item_cost NUMERIC;
  subtotal_value NUMERIC := 0; product_cost_value NUMERIC := 0; direct_cost_value NUMERIC := 0; discount_value NUMERIC := COALESCE((p_payload->>'discount')::NUMERIC, 0); total_value NUMERIC; new_remaining NUMERIC; product_profit_value NUMERIC; transaction_profit_value NUMERIC; margin_percent NUMERIC; due_date_value DATE;
BEGIN
  IF actor_role NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mengedit invoice'; END IF;
  SELECT * INTO inv_row FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice tidak ditemukan'; END IF;
  IF inv_row.status IN ('VOID','DRAFT') THEN RAISE EXCEPTION 'Invoice VOID atau DRAFT tidak dapat diedit dengan fungsi ini'; END IF;
  SELECT * INTO customer_row FROM public.customers WHERE id = inv_row.customer_id;
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN RAISE EXCEPTION 'Invoice harus memiliki minimal satu item'; END IF;
  due_date_value := COALESCE(NULLIF(BTRIM(p_payload->>'dueDate'), '')::DATE, inv_row.due_date, inv_row.issue_date + customer_row.payment_term_days);
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
  DELETE FROM public.invoice_direct_costs WHERE invoice_id = p_invoice_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    quantity_value := (item->>'quantity')::NUMERIC; margin_value := ROUND(COALESCE((item->>'marginQuantity')::NUMERIC, 0), 3); billing_quantity := quantity_value + margin_value;
    IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Jumlah item harus lebih dari nol'; END IF;
    IF margin_value < 0 THEN RAISE EXCEPTION 'Margin item tidak boleh negatif'; END IF;
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
    selling_price := NULLIF((item->>'sellingPrice')::NUMERIC, 0);
    IF selling_price IS NULL OR selling_price <= 0 THEN SELECT cp.selling_price INTO selling_price FROM public.customer_prices cp WHERE cp.customer_id = customer_row.id AND cp.product_id = product_row.id AND cp.effective_at <= NOW() AND (cp.ended_at IS NULL OR cp.ended_at > NOW()) ORDER BY cp.effective_at DESC LIMIT 1; selling_price := COALESCE(selling_price, product_row.default_selling_price); END IF;
    IF selling_price IS NULL OR selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual produk belum tersedia'; END IF;
    purchase_price := NULLIF((item->>'purchasePrice')::NUMERIC, 0);
    IF purchase_price IS NULL OR purchase_price <= 0 THEN SELECT pc.unit_cost INTO purchase_price FROM public.product_costs pc WHERE pc.product_id = product_row.id AND pc.effective_at <= NOW() AND (pc.ended_at IS NULL OR pc.ended_at > NOW()) ORDER BY pc.effective_at DESC LIMIT 1; END IF;
    IF purchase_price IS NULL OR purchase_price <= 0 THEN RAISE EXCEPTION 'HPP aktif produk belum tersedia'; END IF;
    item_subtotal := ROUND(billing_quantity * selling_price, 2); item_cost := ROUND(quantity_value * purchase_price, 2); subtotal_value := subtotal_value + item_subtotal; product_cost_value := product_cost_value + item_cost;
    INSERT INTO public.invoice_items(id, invoice_id, product_id, description_snapshot, quantity, margin_quantity, unit, selling_price_snapshot, purchase_price_snapshot, subtotal, product_cost_total, profit) VALUES (gen_random_uuid(), p_invoice_id, product_row.id, product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END, quantity_value, margin_value, product_row.default_unit, selling_price, purchase_price, item_subtotal, item_cost, item_subtotal - item_cost);
  END LOOP;
  FOR cost IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    IF COALESCE((cost->>'amount')::NUMERIC, 0) <= 0 THEN RAISE EXCEPTION 'Biaya internal harus lebih dari nol'; END IF;
    direct_cost_value := direct_cost_value + (cost->>'amount')::NUMERIC;
    INSERT INTO public.invoice_direct_costs(id, invoice_id, category, name, amount, notes) VALUES (gen_random_uuid(), p_invoice_id, (cost->>'category')::public.direct_cost_category, LEFT(BTRIM(cost->>'name'), 120), (cost->>'amount')::NUMERIC, NULLIF(BTRIM(cost->>'notes'), ''));
  END LOOP;
  IF discount_value > subtotal_value THEN RAISE EXCEPTION 'Diskon melebihi subtotal'; END IF;
  total_value := subtotal_value - discount_value; new_remaining := GREATEST(total_value - inv_row.total_paid, 0); product_profit_value := total_value - product_cost_value; transaction_profit_value := product_profit_value - direct_cost_value; margin_percent := CASE WHEN total_value = 0 THEN 0 ELSE ROUND(transaction_profit_value / total_value * 100, 2) END;
  UPDATE public.invoices SET due_date = due_date_value, notes = NULLIF(BTRIM(p_payload->>'notes'), ''), discount = discount_value, subtotal = subtotal_value, total = total_value, remaining_balance = new_remaining, total_product_cost = product_cost_value, total_direct_cost = direct_cost_value, product_profit = product_profit_value, transaction_profit = transaction_profit_value, transaction_margin = margin_percent, updated_at = NOW() WHERE id = p_invoice_id;
  RETURN jsonb_build_object('invoiceId', p_invoice_id, 'newTotal', total_value, 'newRemaining', new_remaining);
END; $$;

REVOKE ALL ON FUNCTION public.update_invoice_transaction(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_transaction(UUID, JSONB) TO authenticated;
