-- Force deleting a load removes its reconciliation history, but keeps the
-- current reject balance. The balance may include reject from other loads or
-- may already have been partially sold, so it must not be recalculated here.
CREATE OR REPLACE FUNCTION public.force_delete_load_transaction(p_load_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  load_row public.loads%ROWTYPE;
  invoice_ids UUID[];
  actor_name TEXT;
  deleted_invoices INTEGER := 0;
  deleted_reconciliations INTEGER := 0;
BEGIN
  IF actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus muatan secara permanen';
  END IF;

  SELECT * INTO load_row
  FROM public.loads
  WHERE id = p_load_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Muatan tidak ditemukan';
  END IF;

  -- A reconciled load can have a replacement invoice, while the original
  -- invoice still points to the same load through invoices.load_id.
  SELECT COALESCE(ARRAY_AGG(id), ARRAY[]::UUID[])
  INTO invoice_ids
  FROM public.invoices
  WHERE id = load_row.invoice_id
     OR load_id = p_load_id;

  -- Keep reject_stock_balances untouched. It is an aggregate balance and may
  -- contain stock from other loads or stock that has already been sold.
  -- Only remove the rows that would keep the reconciliation FK-linked.
  DELETE FROM public.reject_stock_movements
  WHERE load_id = p_load_id
     OR reconciliation_item_id IN (
       SELECT item.id
       FROM public.load_reconciliation_items AS item
       JOIN public.load_reconciliations AS reconciliation
         ON reconciliation.id = item.reconciliation_id
       WHERE reconciliation.load_id = p_load_id
     );

  DELETE FROM public.reject_stock_lots
  WHERE reconciliation_item_id IN (
    SELECT item.id
    FROM public.load_reconciliation_items AS item
    JOIN public.load_reconciliations AS reconciliation
      ON reconciliation.id = item.reconciliation_id
    WHERE reconciliation.load_id = p_load_id
  );

  DELETE FROM public.load_reconciliation_items
  WHERE reconciliation_id IN (
    SELECT id FROM public.load_reconciliations WHERE load_id = p_load_id
  );

  DELETE FROM public.load_reconciliations
  WHERE load_id = p_load_id;
  GET DIAGNOSTICS deleted_reconciliations = ROW_COUNT;

  -- Payments use RESTRICT, so remove them before deleting invoices/bills.
  DELETE FROM public.payments
  WHERE invoice_id = ANY(invoice_ids);

  DELETE FROM public.supplier_payments
  WHERE supplier_bill_id IN (
    SELECT id FROM public.supplier_bills WHERE load_id = p_load_id
  );

  UPDATE public.loads
  SET invoice_id = NULL,
      updated_at = NOW()
  WHERE id = p_load_id;

  -- Revision links are intentionally not FKs, but must be cleared so a
  -- remaining invoice cannot refer to a force-deleted invoice.
  UPDATE public.invoices
  SET original_invoice_id = NULL,
      superseded_by_invoice_id = NULL,
      updated_at = NOW()
  WHERE original_invoice_id = ANY(invoice_ids)
     OR superseded_by_invoice_id = ANY(invoice_ids);

  DELETE FROM public.invoices
  WHERE id = ANY(invoice_ids);
  GET DIAGNOSTICS deleted_invoices = ROW_COUNT;

  DELETE FROM public.supplier_bills
  WHERE load_id = p_load_id;

  SELECT full_name INTO actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'loads', p_load_id,
    'LOAD_FORCE_DELETED',
    jsonb_build_object(
      'load_number', load_row.load_number,
      'status', load_row.status,
      'deleted_invoices', deleted_invoices,
      'deleted_reconciliations', deleted_reconciliations,
      'reject_balance_preserved', TRUE
    )
  );

  DELETE FROM public.loads
  WHERE id = p_load_id;

  RETURN jsonb_build_object(
    'loadNumber', load_row.load_number,
    'deletedInvoices', deleted_invoices,
    'deletedReconciliations', deleted_reconciliations,
    'rejectBalancePreserved', TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_load_transaction(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_load_transaction(UUID) TO authenticated;
