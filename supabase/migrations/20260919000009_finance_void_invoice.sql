-- Allow Finance to void invoices. The action is still audit-logged, and
-- paid invoices remain protected from being voided.
CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invoices%ROWTYPE; actor_name TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER', 'FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat membatalkan invoice';
  END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status IN ('DRAFT', 'VOID', 'PAID') OR inv.total_paid > 0 THEN RAISE EXCEPTION 'Invoice tidak dapat dibatalkan'; END IF;
  UPDATE public.invoices SET status = 'VOID', remaining_balance = 0, updated_at = NOW() WHERE id = p_invoice_id;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES(auth.uid(), COALESCE(actor_name, 'User'), 'invoices', inv.id, 'INVOICE_VOIDED', jsonb_build_object('reason', p_reason, 'before', to_jsonb(inv)));
END; $$;

REVOKE ALL ON FUNCTION public.void_invoice(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice(UUID, TEXT) TO authenticated;
