-- Allow Owner/Finance to edit or delete reconciled loads by rolling back the
-- reconciliation effects first. This is intentionally destructive and logged.

CREATE OR REPLACE FUNCTION public.prepare_load_for_maintenance(p_load_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  load_row public.loads%ROWTYPE;
  reconciliation_row public.load_reconciliations%ROWTYPE;
  reconciliation_item RECORD;
  invoice_row public.invoices%ROWTYPE;
  actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER', 'FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mengubah muatan';
  END IF;

  SELECT * INTO load_row FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muatan tidak ditemukan'; END IF;

  SELECT * INTO reconciliation_row
  FROM public.load_reconciliations
  WHERE load_id = p_load_id
  FOR UPDATE;

  IF reconciliation_row.id IS NOT NULL THEN
    FOR reconciliation_item IN
      SELECT * FROM public.load_reconciliation_items
      WHERE reconciliation_id = reconciliation_row.id
    LOOP
      IF reconciliation_item.rejected_quantity_kg > 0 THEN
        UPDATE public.reject_stock_balances
        SET quantity_kg = quantity_kg - reconciliation_item.rejected_quantity_kg,
            updated_at = NOW()
        WHERE product_id = reconciliation_item.product_id
          AND quantity_kg >= reconciliation_item.rejected_quantity_kg;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Reject % sudah berubah atau terjual, muatan tidak dapat diubah', reconciliation_item.product_name_snapshot;
        END IF;
      END IF;
      DELETE FROM public.reject_stock_movements WHERE reconciliation_item_id = reconciliation_item.id;
      DELETE FROM public.reject_stock_lots WHERE reconciliation_item_id = reconciliation_item.id;
    END LOOP;
    DELETE FROM public.load_reconciliation_items WHERE reconciliation_id = reconciliation_row.id;
    DELETE FROM public.load_reconciliations WHERE id = reconciliation_row.id;
  END IF;

  IF load_row.invoice_id IS NOT NULL THEN
    SELECT * INTO invoice_row FROM public.invoices WHERE id = load_row.invoice_id FOR UPDATE;
    IF invoice_row.id IS NOT NULL THEN
      DELETE FROM public.payments WHERE invoice_id = invoice_row.id;
      UPDATE public.invoices
      SET total_paid = 0,
          remaining_balance = total,
          status = CASE WHEN status IN ('VOID', 'DRAFT') THEN 'ISSUED' ELSE status END,
          updated_at = NOW()
      WHERE id = invoice_row.id;
    END IF;
  END IF;

  DELETE FROM public.supplier_payments
  WHERE supplier_bill_id IN (SELECT id FROM public.supplier_bills WHERE load_id = p_load_id);
  UPDATE public.supplier_bills
  SET total_paid = 0, remaining_balance = total, status = 'OPEN'
  WHERE load_id = p_load_id;

  UPDATE public.loads
  SET status = 'DISPATCHED', total_accepted_kg = NULL,
      total_rejected_kg = NULL, reconciled_at = NULL, updated_at = NOW()
  WHERE id = p_load_id;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'loads', p_load_id,
    'LOAD_MAINTENANCE_RESET',
    jsonb_build_object('previous_status', load_row.status, 'previous_invoice_id', load_row.invoice_id)
  );
  RETURN jsonb_build_object('loadId', p_load_id, 'reset', TRUE);
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
  invoice_id_value UUID;
  actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER', 'FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menghapus muatan';
  END IF;
  SELECT * INTO load_row FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Muatan tidak ditemukan'; END IF;
  invoice_id_value := load_row.invoice_id;

  PERFORM public.prepare_load_for_maintenance(p_load_id);

  IF invoice_id_value IS NOT NULL THEN
    UPDATE public.loads SET invoice_id = NULL WHERE id = p_load_id;
    DELETE FROM public.payments WHERE invoice_id = invoice_id_value;
    DELETE FROM public.invoices WHERE id = invoice_id_value;
  END IF;
  DELETE FROM public.supplier_payments
  WHERE supplier_bill_id IN (SELECT id FROM public.supplier_bills WHERE load_id = p_load_id);
  DELETE FROM public.supplier_bills WHERE load_id = p_load_id;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'loads', p_load_id,
    'LOAD_DELETED', jsonb_build_object('load_number', load_row.load_number, 'invoice_id', invoice_id_value));
  DELETE FROM public.loads WHERE id = p_load_id;
  RETURN jsonb_build_object('loadNumber', load_row.load_number);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_load_for_maintenance(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_load_transaction(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_load_for_maintenance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_load_transaction(UUID) TO authenticated;
