-- Function to update an existing non-VOID, non-DRAFT invoice
-- Replaces all items and direct costs, recalculates all totals.
-- Preserves invoice_number, status, total_paid, and public_token.
CREATE OR REPLACE FUNCTION public.update_invoice_transaction(p_invoice_id UUID, p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role        public.user_role := public.current_user_role();
  actor_name        TEXT;
  inv_row           public.invoices%ROWTYPE;
  customer_row      public.customers%ROWTYPE;
  item              JSONB;
  cost              JSONB;
  product_row       public.products%ROWTYPE;
  quantity_value    NUMERIC;
  selling_price     NUMERIC;
  purchase_price    NUMERIC;
  item_subtotal     NUMERIC;
  item_cost         NUMERIC;
  subtotal_value    NUMERIC := 0;
  product_cost_val  NUMERIC := 0;
  direct_cost_val   NUMERIC := 0;
  discount_value    NUMERIC := COALESCE((p_payload->>'discount')::NUMERIC, 0);
  total_value       NUMERIC;
  new_remaining     NUMERIC;
  product_profit_v  NUMERIC;
  tx_profit_v       NUMERIC;
  margin_v          NUMERIC;
  due_date_value    DATE;
BEGIN
  -- Auth check
  IF actor_role IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;
  IF actor_role NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mengedit invoice'; END IF;

  -- Load invoice
  SELECT * INTO inv_row FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice tidak ditemukan'; END IF;
  IF inv_row.status IN ('VOID','DRAFT') THEN RAISE EXCEPTION 'Invoice VOID atau DRAFT tidak dapat diedit dengan fungsi ini'; END IF;

  -- Load customer
  SELECT * INTO customer_row FROM public.customers WHERE id = inv_row.customer_id;

  -- Validate items
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN
    RAISE EXCEPTION 'Invoice harus memiliki minimal satu item';
  END IF;
  IF discount_value < 0 THEN RAISE EXCEPTION 'Diskon tidak boleh negatif'; END IF;

  -- Due date
  due_date_value := COALESCE(
    NULLIF(BTRIM(p_payload->>'dueDate'), '')::DATE,
    inv_row.due_date,
    inv_row.issue_date + customer_row.payment_term_days
  );

  -- Delete old items and costs (cascade would handle items but be explicit)
  DELETE FROM public.invoice_items       WHERE invoice_id = p_invoice_id;
  DELETE FROM public.invoice_direct_costs WHERE invoice_id = p_invoice_id;

  -- Re-insert items
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    quantity_value := (item->>'quantity')::NUMERIC;
    IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Jumlah item harus lebih dari nol'; END IF;

    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

    -- Selling price: use override from payload if provided, else default
    selling_price := NULLIF((item->>'sellingPrice')::NUMERIC, 0);
    IF selling_price IS NULL OR selling_price <= 0 THEN
      SELECT cp.selling_price INTO selling_price
      FROM public.customer_prices cp
      WHERE cp.customer_id = customer_row.id AND cp.product_id = product_row.id
        AND cp.effective_at <= NOW() AND (cp.ended_at IS NULL OR cp.ended_at > NOW())
      ORDER BY cp.effective_at DESC LIMIT 1;
      selling_price := COALESCE(selling_price, product_row.default_selling_price);
    END IF;
    IF selling_price IS NULL OR selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual produk belum tersedia'; END IF;

    -- Purchase price: use override or active cost
    purchase_price := NULLIF((item->>'purchasePrice')::NUMERIC, 0);
    IF purchase_price IS NULL OR purchase_price <= 0 THEN
      SELECT pc.unit_cost INTO purchase_price
      FROM public.product_costs pc
      WHERE pc.product_id = product_row.id
        AND pc.effective_at <= NOW() AND (pc.ended_at IS NULL OR pc.ended_at > NOW())
      ORDER BY pc.effective_at DESC LIMIT 1;
    END IF;
    IF purchase_price IS NULL OR purchase_price <= 0 THEN RAISE EXCEPTION 'HPP aktif produk belum tersedia'; END IF;

    item_subtotal    := ROUND(quantity_value * selling_price, 2);
    item_cost        := ROUND(quantity_value * purchase_price, 2);
    subtotal_value   := subtotal_value + item_subtotal;
    product_cost_val := product_cost_val + item_cost;

    INSERT INTO public.invoice_items(
      id, invoice_id, product_id, description_snapshot, quantity, unit,
      selling_price_snapshot, purchase_price_snapshot, subtotal, product_cost_total, profit
    ) VALUES (
      gen_random_uuid(), p_invoice_id, product_row.id,
      product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      quantity_value, product_row.default_unit,
      selling_price, purchase_price,
      item_subtotal, item_cost, item_subtotal - item_cost
    );
  END LOOP;

  -- Re-insert direct costs
  FOR cost IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    IF COALESCE((cost->>'amount')::NUMERIC, 0) <= 0 THEN RAISE EXCEPTION 'Biaya internal harus lebih dari nol'; END IF;
    direct_cost_val := direct_cost_val + (cost->>'amount')::NUMERIC;
    INSERT INTO public.invoice_direct_costs(id, invoice_id, category, name, amount, notes)
    VALUES (
      gen_random_uuid(), p_invoice_id,
      (cost->>'category')::public.direct_cost_category,
      LEFT(BTRIM(cost->>'name'), 120),
      (cost->>'amount')::NUMERIC,
      NULLIF(BTRIM(cost->>'notes'), '')
    );
  END LOOP;

  IF discount_value > subtotal_value THEN RAISE EXCEPTION 'Diskon melebihi subtotal'; END IF;

  -- Recalculate totals
  total_value      := subtotal_value - discount_value;
  product_profit_v := total_value - product_cost_val;
  tx_profit_v      := product_profit_v - direct_cost_val;
  margin_v         := CASE WHEN total_value = 0 THEN 0
                           ELSE ROUND(tx_profit_v / total_value * 100, 2) END;
  -- Preserve what has been paid; remaining = new total - already paid (min 0)
  new_remaining    := GREATEST(total_value - inv_row.total_paid, 0);

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();

  UPDATE public.invoices SET
    due_date           = due_date_value,
    notes              = NULLIF(BTRIM(p_payload->>'notes'), ''),
    discount           = discount_value,
    subtotal           = subtotal_value,
    total              = total_value,
    remaining_balance  = new_remaining,
    total_product_cost = product_cost_val,
    total_direct_cost  = direct_cost_val,
    product_profit     = product_profit_v,
    transaction_profit = tx_profit_v,
    transaction_margin = margin_v,
    updated_at         = NOW()
  WHERE id = p_invoice_id;

  -- Re-evaluate status based on new totals
  UPDATE public.invoices SET
    status = CASE
      WHEN new_remaining <= 0 AND inv_row.total_paid > 0 THEN 'PAID'::public.invoice_status
      WHEN inv_row.total_paid > 0 AND new_remaining > 0   THEN 'PARTIALLY_PAID'::public.invoice_status
      WHEN due_date_value < CURRENT_DATE AND new_remaining > 0 THEN 'OVERDUE'::public.invoice_status
      ELSE inv_row.status
    END
  WHERE id = p_invoice_id;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', p_invoice_id, 'INVOICE_UPDATED',
    jsonb_build_object('new_total', total_value, 'discount', discount_value));

  RETURN jsonb_build_object('invoiceId', p_invoice_id, 'newTotal', total_value, 'newRemaining', new_remaining);
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_transaction(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_transaction(UUID, JSONB) TO authenticated;

-- Also allow payments to be recorded on PAID invoices (for underpayment correction)
-- The existing RLS on payments already allows insert for authenticated users.
-- No schema change needed — the createPaymentAction in app code will handle the logic.
