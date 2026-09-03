-- Hutang supplier is recorded explicitly. Product-cost history is only HPP
-- metadata and must never be treated as an accounts-payable transaction.

DO $$ BEGIN
  CREATE TYPE public.supplier_bill_status AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.supplier_bill_number_sequences (
  period_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL CHECK (last_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_reference TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status public.supplier_bill_status NOT NULL DEFAULT 'OPEN',
  total NUMERIC(12, 2) NOT NULL CHECK (total > 0),
  total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
  remaining_balance NUMERIC(12, 2) NOT NULL CHECK (remaining_balance >= 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_date IS NULL OR due_date >= bill_date),
  CHECK (total_paid <= total),
  CHECK (remaining_balance = total - total_paid)
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_bill_id UUID NOT NULL REFERENCES public.supplier_bills(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL DEFAULT 'TRANSFER',
  reference_number TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON public.supplier_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_status_due_date ON public.supplier_bills(status, due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_bill ON public.supplier_payments(supplier_bill_id);

CREATE OR REPLACE FUNCTION public.create_supplier_bill_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  actor_name TEXT;
  supplier_row public.suppliers%ROWTYPE;
  bill_id UUID := gen_random_uuid();
  bill_date_value DATE := COALESCE(NULLIF(p_payload->>'billDate', '')::DATE, CURRENT_DATE);
  due_date_value DATE := NULLIF(p_payload->>'dueDate', '')::DATE;
  total_value NUMERIC := ROUND(COALESCE((p_payload->>'total')::NUMERIC, 0), 2);
  period_key_value TEXT;
  sequence_value INTEGER;
  bill_number_value TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mencatat hutang supplier';
  END IF;
  IF total_value <= 0 THEN RAISE EXCEPTION 'Total tagihan harus lebih dari nol'; END IF;
  IF due_date_value IS NOT NULL AND due_date_value < bill_date_value THEN
    RAISE EXCEPTION 'Jatuh tempo tidak boleh sebelum tanggal tagihan';
  END IF;

  SELECT * INTO supplier_row FROM public.suppliers
  WHERE id = (p_payload->>'supplierId')::UUID;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier tidak ditemukan'; END IF;

  period_key_value := TO_CHAR(bill_date_value, 'YYYY/MM');
  INSERT INTO public.supplier_bill_number_sequences(period_key, last_value)
  VALUES (period_key_value, 1)
  ON CONFLICT (period_key) DO UPDATE
    SET last_value = public.supplier_bill_number_sequences.last_value + 1,
        updated_at = NOW()
  RETURNING last_value INTO sequence_value;
  bill_number_value := 'HTG/' || period_key_value || '/' || LPAD(sequence_value::TEXT, 4, '0');

  INSERT INTO public.supplier_bills(
    id, bill_number, supplier_id, supplier_reference, bill_date, due_date,
    status, total, total_paid, remaining_balance, notes, created_by
  ) VALUES (
    bill_id, bill_number_value, supplier_row.id,
    NULLIF(BTRIM(p_payload->>'supplierReference'), ''), bill_date_value, due_date_value,
    'OPEN', total_value, 0, total_value, NULLIF(BTRIM(p_payload->>'notes'), ''), auth.uid()
  );

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'supplier_bills', bill_id, 'SUPPLIER_BILL_CREATED',
    jsonb_build_object('bill_number', bill_number_value, 'supplier_id', supplier_row.id, 'total', total_value)
  );

  RETURN jsonb_build_object('supplierBillId', bill_id, 'billNumber', bill_number_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment_transaction(
  p_supplier_bill_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_method public.payment_method,
  p_reference_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bill public.supplier_bills%ROWTYPE;
  payment_id UUID := gen_random_uuid();
  actor_name TEXT;
  new_paid NUMERIC;
  new_remaining NUMERIC;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mencatat pembayaran supplier';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Jumlah pembayaran harus lebih dari nol'; END IF;

  SELECT * INTO bill FROM public.supplier_bills WHERE id = p_supplier_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan supplier tidak ditemukan'; END IF;
  IF bill.status IN ('VOID'::public.supplier_bill_status, 'PAID'::public.supplier_bill_status) THEN
    RAISE EXCEPTION 'Tagihan ini tidak dapat menerima pembayaran';
  END IF;
  IF p_amount > bill.remaining_balance THEN RAISE EXCEPTION 'Pembayaran melebihi sisa tagihan'; END IF;

  new_paid := bill.total_paid + p_amount;
  new_remaining := bill.total - new_paid;
  INSERT INTO public.supplier_payments(
    id, supplier_bill_id, amount, payment_date, method, reference_number, notes, recorded_by
  ) VALUES (
    payment_id, bill.id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), p_method,
    NULLIF(BTRIM(p_reference_number), ''), NULLIF(BTRIM(p_notes), ''), auth.uid()
  );
  UPDATE public.supplier_bills
  SET total_paid = new_paid,
      remaining_balance = new_remaining,
      status = CASE WHEN new_remaining = 0 THEN 'PAID'::public.supplier_bill_status ELSE 'PARTIALLY_PAID'::public.supplier_bill_status END,
      updated_at = NOW()
  WHERE id = bill.id;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'supplier_payments', payment_id, 'SUPPLIER_PAYMENT_RECORDED',
    jsonb_build_object('supplier_bill_id', bill.id, 'amount', p_amount)
  );
  RETURN payment_id;
END;
$$;

ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approved_supplier_bills_read ON public.supplier_bills;
DROP POLICY IF EXISTS finance_supplier_bills_write ON public.supplier_bills;
DROP POLICY IF EXISTS approved_supplier_payments_read ON public.supplier_payments;
DROP POLICY IF EXISTS finance_supplier_payments_write ON public.supplier_payments;
CREATE POLICY approved_supplier_bills_read ON public.supplier_bills FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY finance_supplier_bills_write ON public.supplier_bills FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role))
  WITH CHECK (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));
CREATE POLICY approved_supplier_payments_read ON public.supplier_payments FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY finance_supplier_payments_write ON public.supplier_payments FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role))
  WITH CHECK (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));

REVOKE ALL ON FUNCTION public.create_supplier_bill_transaction(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_supplier_payment_transaction(UUID, NUMERIC, DATE, public.payment_method, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_supplier_bill_transaction(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_supplier_payment_transaction(UUID, NUMERIC, DATE, public.payment_method, TEXT, TEXT) TO authenticated;
