-- Function to delete a payment and recalculate invoice totals
CREATE OR REPLACE FUNCTION public.void_payment_transaction(p_payment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role    public.user_role := public.current_user_role();
  actor_name    TEXT;
  pay_row       public.payments%ROWTYPE;
  inv_row       public.invoices%ROWTYPE;
  new_paid      NUMERIC;
  new_remaining NUMERIC;
  new_status    public.invoice_status;
BEGIN
  IF actor_role NOT IN ('OWNER','FINANCE') THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat membatalkan pembayaran';
  END IF;

  SELECT * INTO pay_row FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembayaran tidak ditemukan'; END IF;

  SELECT * INTO inv_row FROM public.invoices WHERE id = pay_row.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice tidak ditemukan'; END IF;
  IF inv_row.status = 'VOID' THEN RAISE EXCEPTION 'Invoice sudah dibatalkan'; END IF;

  -- Recalculate totals after removing this payment
  new_paid      := GREATEST(inv_row.total_paid - pay_row.amount, 0);
  new_remaining := inv_row.total - new_paid;

  -- Determine new status
  IF new_paid <= 0 THEN
    new_status := 'ISSUED';
    IF inv_row.due_date < CURRENT_DATE THEN new_status := 'OVERDUE'; END IF;
  ELSIF new_remaining > 0 THEN
    new_status := 'PARTIALLY_PAID';
    IF inv_row.due_date < CURRENT_DATE THEN new_status := 'OVERDUE'; END IF;
  ELSE
    new_status := 'PAID';
  END IF;

  -- Delete the payment
  DELETE FROM public.payments WHERE id = p_payment_id;

  -- Update invoice
  UPDATE public.invoices SET
    total_paid        = new_paid,
    remaining_balance = new_remaining,
    status            = new_status,
    updated_at        = NOW()
  WHERE id = inv_row.id;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name,'User'), 'payments', p_payment_id, 'PAYMENT_VOIDED',
    jsonb_build_object('invoice_id', inv_row.id, 'amount', pay_row.amount));
END;
$$;

REVOKE ALL ON FUNCTION public.void_payment_transaction(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_payment_transaction(UUID) TO authenticated;
