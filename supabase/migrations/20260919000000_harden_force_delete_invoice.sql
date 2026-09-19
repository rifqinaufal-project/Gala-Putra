-- Force deleting an invoice must clean up every restrictive reference first.
-- In particular, factory loads keep a RESTRICT reference to their invoice.
CREATE OR REPLACE FUNCTION public.force_delete_invoice(p_invoice_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  actor_name TEXT;
  inv public.invoices%ROWTYPE;
  item_row RECORD;
  balance_row public.stock_balances%ROWTYPE;
  prod_name TEXT;
  prod_unit TEXT;
BEGIN
  IF actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus invoice secara permanen';
  END IF;

  SELECT * INTO inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice tidak ditemukan';
  END IF;

  -- Roll back stock for issued invoices before their invoice items disappear.
  IF inv.status NOT IN ('DRAFT', 'VOID') THEN
    FOR item_row IN
      SELECT sm.id AS sm_id, sm.product_id, sm.invoice_item_id, sm.quantity_delta
      FROM public.stock_movements AS sm
      WHERE sm.invoice_id = p_invoice_id
        AND sm.movement_type = 'SALE_OUT'
    LOOP
      SELECT p.name || CASE WHEN p.size IS NOT NULL THEN ' [' || p.size || ']' ELSE '' END,
             p.default_unit
      INTO prod_name, prod_unit
      FROM public.products AS p
      WHERE p.id = item_row.product_id;

      prod_name := COALESCE(prod_name, 'Produk dihapus');
      prod_unit := COALESCE(prod_unit, 'pcs');

      SELECT * INTO balance_row
      FROM public.stock_balances
      WHERE product_id = item_row.product_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.stock_balances
        SET quantity = quantity + ABS(item_row.quantity_delta),
            updated_at = NOW()
        WHERE product_id = item_row.product_id;

        INSERT INTO public.stock_movements(
          id, product_id, product_name_snapshot, unit, movement_type,
          quantity_delta, balance_after, invoice_id, invoice_item_id,
          notes, created_by
        ) VALUES (
          gen_random_uuid(), item_row.product_id, prod_name, prod_unit,
          'INVOICE_VOID_RETURN', ABS(item_row.quantity_delta),
          balance_row.quantity + ABS(item_row.quantity_delta), p_invoice_id,
          item_row.invoice_item_id,
          'Rollback: force delete invoice ' || COALESCE(inv.invoice_number, p_invoice_id::TEXT),
          auth.uid()
        );
      END IF;
    END LOOP;
  END IF;

  SELECT full_name INTO actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'invoices', p_invoice_id,
    'INVOICE_FORCE_DELETED',
    jsonb_build_object(
      'invoice_number', inv.invoice_number,
      'status', inv.status,
      'total', inv.total,
      'total_paid', inv.total_paid,
      'related_loads_detached', TRUE
    )
  );

  -- payments and loads both use RESTRICT, so remove their references before
  -- deleting the invoice. The load itself remains available for its audit and
  -- operational history; only its deleted invoice link is cleared.
  DELETE FROM public.payments
  WHERE invoice_id = p_invoice_id;

  UPDATE public.loads
  SET invoice_id = NULL,
      updated_at = NOW()
  WHERE invoice_id = p_invoice_id;

  -- Keep revision chains free of references to the deleted invoice. These
  -- columns intentionally do not use a database FK because revisions may be
  -- retained independently, so the cleanup belongs in the force-delete RPC.
  UPDATE public.invoices
  SET original_invoice_id = NULL,
      superseded_by_invoice_id = NULL,
      updated_at = NOW()
  WHERE original_invoice_id = p_invoice_id
     OR superseded_by_invoice_id = p_invoice_id;

  DELETE FROM public.invoices
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_invoice(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_invoice(UUID) TO authenticated;
