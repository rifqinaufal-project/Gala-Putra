CREATE OR REPLACE FUNCTION public.force_delete_invoice(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_role    public.user_role := public.current_user_role();
  actor_name    TEXT;
  inv           public.invoices%ROWTYPE;
  item_row      RECORD;
  balance_row   public.stock_balances%ROWTYPE;
  prod_name     TEXT;
  prod_unit     TEXT;
BEGIN
  IF actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus invoice secara permanen';
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice tidak ditemukan'; END IF;

  -- Rollback stock for non-DRAFT/VOID invoices
  IF inv.status NOT IN ('DRAFT', 'VOID') THEN
    FOR item_row IN
      SELECT sm.id AS sm_id, sm.product_id, sm.quantity_delta
      FROM public.stock_movements sm
      WHERE sm.invoice_id = p_invoice_id AND sm.movement_type = 'SALE_OUT'
    LOOP
      SELECT p.name || CASE WHEN p.size IS NOT NULL THEN ' [' || p.size || ']' ELSE '' END,
             p.default_unit
      INTO prod_name, prod_unit
      FROM public.products p WHERE p.id = item_row.product_id;

      prod_name := COALESCE(prod_name, 'Produk dihapus');
      prod_unit := COALESCE(prod_unit, 'pcs');

      SELECT * INTO balance_row FROM public.stock_balances
        WHERE product_id = item_row.product_id FOR UPDATE;

      IF FOUND THEN
        UPDATE public.stock_balances
          SET quantity = quantity + ABS(item_row.quantity_delta), updated_at = NOW()
        WHERE product_id = item_row.product_id;

        -- invoice_item_id set NULL karena invoice_items akan dihapus via cascade
        INSERT INTO public.stock_movements(
          id, product_id, product_name_snapshot, unit, movement_type,
          quantity_delta, balance_after,
          invoice_id, invoice_item_id, notes, created_by
        ) VALUES (
          gen_random_uuid(),
          item_row.product_id,
          prod_name,
          prod_unit,
          'INVOICE_VOID_RETURN',
          ABS(item_row.quantity_delta),
          balance_row.quantity + ABS(item_row.quantity_delta),
          p_invoice_id,
          NULL,
          'Rollback: force delete invoice ' || COALESCE(inv.invoice_number, p_invoice_id::TEXT),
          auth.uid()
        );
      END IF;
    END LOOP;
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name,'Owner'), 'invoices', p_invoice_id, 'INVOICE_FORCE_DELETED',
    jsonb_build_object(
      'invoice_number', inv.invoice_number,
      'status', inv.status,
      'total', inv.total,
      'total_paid', inv.total_paid
    ));

  DELETE FROM public.payments WHERE invoice_id = p_invoice_id;
  DELETE FROM public.invoices WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_invoice(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_invoice(UUID) TO authenticated;
