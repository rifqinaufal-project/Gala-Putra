-- Explicit HPP correction. This does not rewrite supplier purchase facts or
-- batch costs; it records an intentional correction to the invoice cost basis.
CREATE OR REPLACE FUNCTION public.adjust_product_average_cost(
  p_product_id UUID,
  p_new_cost NUMERIC,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  balance_row public.stock_balances%ROWTYPE;
  old_cost_value NUMERIC;
  new_cost_value NUMERIC := ROUND(COALESCE(p_new_cost, 0), 2);
  actor_name TEXT;
  cost_id UUID;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menyesuaikan HPP';
  END IF;
  IF new_cost_value <= 0 THEN RAISE EXCEPTION 'HPP baru harus lebih besar dari nol'; END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Alasan penyesuaian HPP wajib diisi'; END IF;

  SELECT * INTO product_row FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  INSERT INTO public.stock_balances(product_id) VALUES (p_product_id)
  ON CONFLICT (product_id) DO NOTHING;
  SELECT * INTO balance_row FROM public.stock_balances WHERE product_id = p_product_id FOR UPDATE;
  old_cost_value := ROUND(COALESCE(balance_row.average_unit_cost, 0), 2);

  UPDATE public.stock_balances
  SET average_unit_cost = new_cost_value, updated_at = NOW()
  WHERE product_id = p_product_id;

  cost_id := public.set_product_cost(
    p_product_id, NULL, new_cost_value, NOW(),
    'Koreksi HPP: ' || BTRIM(p_reason)
  );

  INSERT INTO public.product_cost_history(
    product_id, old_cost, new_cost, source_type, source_id, created_by
  ) VALUES (
    p_product_id, old_cost_value, new_cost_value, 'MANUAL_ADJUSTMENT', cost_id, auth.uid()
  );

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'products', p_product_id, 'PRODUCT_AVERAGE_COST_ADJUSTED',
    jsonb_build_object(
      'product_name', product_row.name,
      'old_cost', old_cost_value,
      'new_cost', new_cost_value,
      'reason', BTRIM(p_reason),
      'quantity_unchanged', TRUE
    )
  );

  RETURN jsonb_build_object('oldCost', old_cost_value, 'newCost', new_cost_value);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_product_average_cost(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_average_cost(UUID, NUMERIC, TEXT) TO authenticated;
