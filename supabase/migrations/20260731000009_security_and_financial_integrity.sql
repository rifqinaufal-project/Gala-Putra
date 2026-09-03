-- Security hardening, safe public invoices, and atomic financial mutations.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_token_key ON public.invoices(public_token);

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS proof_path TEXT;
UPDATE public.company_profile SET logo_url = NULL WHERE logo_url LIKE 'data:%';
ALTER TABLE public.company_profile DROP CONSTRAINT IF EXISTS company_profile_logo_url_check;
ALTER TABLE public.company_profile ADD CONSTRAINT company_profile_logo_url_check CHECK (logo_url IS NULL OR logo_url !~ '^data:');
ALTER TABLE public.customer_prices ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE public.customer_prices DROP CONSTRAINT IF EXISTS customer_product_unique;
CREATE UNIQUE INDEX IF NOT EXISTS customer_prices_one_active_price
  ON public.customer_prices(customer_id, product_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
  period_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL CHECK (last_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.invoice_number_sequences(period_key, last_value)
SELECT split_part(invoice_number, '/', 2) || '/' || split_part(invoice_number, '/', 3),
       MAX(split_part(invoice_number, '/', 4)::INTEGER)
FROM public.invoices
WHERE invoice_number ~ '^INV/[0-9]{4}/[0-9]{2}/[0-9]+$'
GROUP BY split_part(invoice_number, '/', 2), split_part(invoice_number, '/', 3)
ON CONFLICT (period_key) DO UPDATE SET last_value = GREATEST(public.invoice_number_sequences.last_value, EXCLUDED.last_value);

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_payment_term_days_check,
  ADD CONSTRAINT customers_payment_term_days_check CHECK (payment_term_days >= 0);
ALTER TABLE public.product_costs
  DROP CONSTRAINT IF EXISTS product_costs_unit_cost_check,
  ADD CONSTRAINT product_costs_unit_cost_check CHECK (unit_cost > 0),
  DROP CONSTRAINT IF EXISTS product_costs_date_range_check,
  ADD CONSTRAINT product_costs_date_range_check CHECK (ended_at IS NULL OR ended_at > effective_at);
ALTER TABLE public.customer_prices
  DROP CONSTRAINT IF EXISTS customer_prices_selling_price_check,
  ADD CONSTRAINT customer_prices_selling_price_check CHECK (selling_price > 0),
  DROP CONSTRAINT IF EXISTS customer_prices_date_range_check,
  ADD CONSTRAINT customer_prices_date_range_check CHECK (ended_at IS NULL OR ended_at > effective_at);
ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_quantity_check,
  ADD CONSTRAINT invoice_items_quantity_check CHECK (quantity > 0),
  DROP CONSTRAINT IF EXISTS invoice_items_prices_check,
  ADD CONSTRAINT invoice_items_prices_check CHECK (selling_price_snapshot >= 0 AND purchase_price_snapshot >= 0);
ALTER TABLE public.invoice_direct_costs
  DROP CONSTRAINT IF EXISTS invoice_direct_costs_amount_check,
  ADD CONSTRAINT invoice_direct_costs_amount_check CHECK (amount > 0);
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_amount_check,
  ADD CONSTRAINT payments_amount_check CHECK (amount > 0);
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_amount_check,
  ADD CONSTRAINT expenses_amount_check CHECK (amount > 0);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT;
ALTER TABLE public.product_costs DROP CONSTRAINT IF EXISTS product_costs_supplier_id_fkey;
ALTER TABLE public.product_costs ADD CONSTRAINT product_costs_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND status = 'APPROVED'::public.profile_status
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles
  WHERE id = auth.uid() AND status = 'APPROVED'::public.profile_status;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''), 'User'),
    'STAFF'::public.user_role,
    'PENDING'::public.profile_status
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.manage_user_approval(
  p_user_id UUID,
  p_status public.profile_status,
  p_role public.user_role DEFAULT 'STAFF'::public.user_role
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name TEXT;
  old_profile JSONB;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengelola persetujuan pengguna';
  END IF;
  IF p_user_id = auth.uid() AND p_status <> 'APPROVED'::public.profile_status THEN
    RAISE EXCEPTION 'Owner tidak dapat menolak akunnya sendiri';
  END IF;

  SELECT to_jsonb(p), (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  INTO old_profile, actor_name
  FROM public.profiles p WHERE p.id = p_user_id;
  IF old_profile IS NULL THEN RAISE EXCEPTION 'Profil pengguna tidak ditemukan'; END IF;

  UPDATE public.profiles
  SET status = p_status,
      role = CASE WHEN p_status = 'APPROVED'::public.profile_status THEN p_role ELSE role END,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'Owner'), 'profiles', p_user_id,
    CASE WHEN p_status = 'APPROVED' THEN 'USER_APPROVED' ELSE 'USER_REJECTED' END,
    jsonb_build_object('before', old_profile, 'status', p_status, 'role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invoice_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  actor_name TEXT;
  invoice_id UUID := gen_random_uuid();
  token UUID := gen_random_uuid();
  customer_row public.customers%ROWTYPE;
  item JSONB;
  cost JSONB;
  product_row public.products%ROWTYPE;
  quantity_value NUMERIC;
  selling_price NUMERIC;
  purchase_price NUMERIC;
  item_subtotal NUMERIC;
  item_cost NUMERIC;
  subtotal_value NUMERIC := 0;
  product_cost_value NUMERIC := 0;
  direct_cost_value NUMERIC := 0;
  discount_value NUMERIC := COALESCE((p_payload->>'discount')::NUMERIC, 0);
  total_value NUMERIC;
  product_profit_value NUMERIC;
  transaction_profit_value NUMERIC;
  margin_value NUMERIC;
  requested_status public.invoice_status;
  issue_date_value DATE := COALESCE((p_payload->>'issueDate')::DATE, CURRENT_DATE);
  due_date_value DATE;
  invoice_number_value TEXT;
  sequence_value INTEGER;
  period_key_value TEXT;
BEGIN
  IF actor_role IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;
  requested_status := COALESCE((p_payload->>'status')::public.invoice_status, 'DRAFT');
  IF requested_status NOT IN ('DRAFT', 'ISSUED') THEN RAISE EXCEPTION 'Status invoice tidak valid'; END IF;
  IF actor_role = 'STAFF' AND requested_status <> 'DRAFT' THEN RAISE EXCEPTION 'Staff hanya dapat membuat draft'; END IF;
  IF actor_role = 'STAFF' AND (discount_value <> 0 OR jsonb_array_length(COALESCE(p_payload->'costs', '[]')) > 0) THEN
    RAISE EXCEPTION 'Staff tidak dapat mengatur diskon atau biaya internal';
  END IF;
  IF discount_value < 0 THEN RAISE EXCEPTION 'Diskon tidak boleh negatif'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN RAISE EXCEPTION 'Invoice harus memiliki item'; END IF;

  SELECT * INTO customer_row FROM public.customers
  WHERE id = (p_payload->>'customerId')::UUID AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Restoran aktif tidak ditemukan'; END IF;

  due_date_value := COALESCE((p_payload->>'dueDate')::DATE, issue_date_value + customer_row.payment_term_days);
  IF due_date_value < issue_date_value THEN RAISE EXCEPTION 'Jatuh tempo tidak boleh sebelum tanggal invoice'; END IF;

  IF requested_status = 'ISSUED' THEN
    period_key_value := TO_CHAR(issue_date_value, 'YYYY/MM');
    INSERT INTO public.invoice_number_sequences(period_key, last_value)
    VALUES (period_key_value, 1)
    ON CONFLICT (period_key) DO UPDATE SET last_value = public.invoice_number_sequences.last_value + 1, updated_at = NOW()
    RETURNING last_value INTO sequence_value;
    invoice_number_value := 'INV/' || period_key_value || '/' || LPAD(sequence_value::TEXT, 4, '0');
  END IF;

  INSERT INTO public.invoices(id, public_token, invoice_number, customer_id, issue_date, due_date, status,
    subtotal, discount, total, total_paid, remaining_balance, total_product_cost, total_direct_cost,
    product_profit, transaction_profit, transaction_margin, notes, created_by)
  VALUES (invoice_id, token, invoice_number_value, customer_row.id, issue_date_value, due_date_value, requested_status,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULLIF(BTRIM(p_payload->>'notes'), ''), auth.uid());

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    quantity_value := (item->>'quantity')::NUMERIC;
    IF quantity_value IS NULL OR quantity_value <= 0 THEN RAISE EXCEPTION 'Jumlah item harus lebih dari nol'; END IF;
    SELECT * INTO product_row FROM public.products
    WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;

    SELECT cp.selling_price INTO selling_price
    FROM public.customer_prices cp
    WHERE cp.customer_id = customer_row.id AND cp.product_id = product_row.id
      AND cp.effective_at <= NOW() AND (cp.ended_at IS NULL OR cp.ended_at > NOW())
    ORDER BY cp.effective_at DESC LIMIT 1;
    selling_price := COALESCE(selling_price, product_row.default_selling_price);
    IF selling_price IS NULL OR selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual produk belum tersedia'; END IF;

    SELECT pc.unit_cost INTO purchase_price
    FROM public.product_costs pc
    WHERE pc.product_id = product_row.id
      AND pc.effective_at <= NOW() AND (pc.ended_at IS NULL OR pc.ended_at > NOW())
    ORDER BY pc.effective_at DESC LIMIT 1;
    IF purchase_price IS NULL OR purchase_price <= 0 THEN RAISE EXCEPTION 'HPP aktif produk belum tersedia'; END IF;

    item_subtotal := ROUND(quantity_value * selling_price, 2);
    item_cost := ROUND(quantity_value * purchase_price, 2);
    subtotal_value := subtotal_value + item_subtotal;
    product_cost_value := product_cost_value + item_cost;

    INSERT INTO public.invoice_items(id, invoice_id, product_id, description_snapshot, quantity, unit,
      selling_price_snapshot, purchase_price_snapshot, subtotal, product_cost_total, profit)
    VALUES (gen_random_uuid(), invoice_id, product_row.id,
      product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      quantity_value, product_row.default_unit, selling_price, purchase_price, item_subtotal, item_cost, item_subtotal - item_cost);
  END LOOP;

  FOR cost IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs', '[]')) LOOP
    IF COALESCE((cost->>'amount')::NUMERIC, 0) <= 0 THEN RAISE EXCEPTION 'Biaya internal harus lebih dari nol'; END IF;
    direct_cost_value := direct_cost_value + (cost->>'amount')::NUMERIC;
    INSERT INTO public.invoice_direct_costs(id, invoice_id, category, name, amount, notes)
    VALUES (gen_random_uuid(), invoice_id, (cost->>'category')::public.direct_cost_category,
      LEFT(BTRIM(cost->>'name'), 120), (cost->>'amount')::NUMERIC, NULLIF(BTRIM(cost->>'notes'), ''));
  END LOOP;

  IF discount_value > subtotal_value THEN RAISE EXCEPTION 'Diskon melebihi subtotal'; END IF;
  total_value := subtotal_value - discount_value;
  product_profit_value := total_value - product_cost_value;
  transaction_profit_value := product_profit_value - direct_cost_value;
  margin_value := CASE WHEN total_value = 0 THEN 0 ELSE ROUND(transaction_profit_value / total_value * 100, 2) END;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  UPDATE public.invoices SET subtotal = subtotal_value, discount = discount_value, total = total_value,
    remaining_balance = total_value, total_product_cost = product_cost_value, total_direct_cost = direct_cost_value,
    product_profit = product_profit_value, transaction_profit = transaction_profit_value,
    transaction_margin = margin_value, updated_at = NOW()
  WHERE id = invoice_id;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', invoice_id, 'INVOICE_CREATED',
    jsonb_build_object('status', requested_status, 'total', total_value, 'invoice_number', invoice_number_value));

  RETURN jsonb_build_object('invoiceId', invoice_id, 'invoiceNumber', invoice_number_value, 'publicToken', token);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_transaction(
  p_invoice_id UUID, p_amount NUMERIC, p_payment_date DATE, p_method public.payment_method,
  p_reference_number TEXT DEFAULT NULL, p_proof_path TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invoices%ROWTYPE;
  payment_id UUID := gen_random_uuid();
  actor_name TEXT;
  new_paid NUMERIC;
  new_remaining NUMERIC;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER', 'FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mencatat pembayaran'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Jumlah pembayaran harus lebih dari nol'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice tidak ditemukan'; END IF;
  IF inv.status IN ('DRAFT', 'VOID', 'PAID') THEN RAISE EXCEPTION 'Invoice tidak dapat menerima pembayaran'; END IF;
  IF p_amount > inv.remaining_balance THEN RAISE EXCEPTION 'Pembayaran melebihi sisa tagihan'; END IF;
  IF p_proof_path IS NOT NULL AND p_proof_path NOT LIKE auth.uid()::TEXT || '/%' THEN RAISE EXCEPTION 'Path bukti pembayaran tidak valid'; END IF;

  new_paid := inv.total_paid + p_amount;
  new_remaining := inv.total - new_paid;
  INSERT INTO public.payments(id, invoice_id, amount, payment_date, method, reference_number, proof_path, notes, recorded_by)
  VALUES (payment_id, p_invoice_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE), p_method,
    NULLIF(BTRIM(p_reference_number), ''), p_proof_path, NULLIF(BTRIM(p_notes), ''), auth.uid());
  UPDATE public.invoices SET total_paid = new_paid, remaining_balance = new_remaining,
    status = CASE WHEN new_remaining = 0 THEN 'PAID'::public.invoice_status ELSE 'PARTIALLY_PAID'::public.invoice_status END,
    updated_at = NOW() WHERE id = p_invoice_id;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'payments', payment_id, 'PAYMENT_RECORDED',
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount));
  RETURN payment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_draft_invoice(p_invoice_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invoices%ROWTYPE; actor_name TEXT;
BEGIN
  IF public.current_user_role() IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'DRAFT' THEN RAISE EXCEPTION 'Hanya draft yang dapat dihapus'; END IF;
  IF public.current_user_role() = 'STAFF' AND inv.created_by <> auth.uid() THEN RAISE EXCEPTION 'Draft bukan milik Anda'; END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES(auth.uid(), COALESCE(actor_name, 'User'), 'invoices', inv.id, 'DRAFT_DELETED', to_jsonb(inv));
  DELETE FROM public.invoices WHERE id = p_invoice_id;
END; $$;

CREATE OR REPLACE FUNCTION public.void_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invoices%ROWTYPE; actor_name TEXT;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'OWNER'::public.user_role THEN RAISE EXCEPTION 'Hanya Owner yang dapat membatalkan invoice'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status IN ('DRAFT', 'VOID', 'PAID') OR inv.total_paid > 0 THEN RAISE EXCEPTION 'Invoice tidak dapat dibatalkan'; END IF;
  UPDATE public.invoices SET status = 'VOID', remaining_balance = 0, updated_at = NOW() WHERE id = p_invoice_id;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES(auth.uid(), COALESCE(actor_name, 'Owner'), 'invoices', inv.id, 'INVOICE_VOIDED', jsonb_build_object('reason', p_reason, 'before', to_jsonb(inv)));
END; $$;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv public.invoices%ROWTYPE; period_key_value TEXT; sequence_value INTEGER; number_value TEXT; actor_name TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menerbitkan invoice'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR inv.status <> 'DRAFT' THEN RAISE EXCEPTION 'Hanya draft yang dapat diterbitkan'; END IF;
  IF inv.total <= 0 THEN RAISE EXCEPTION 'Total invoice harus lebih dari nol'; END IF;
  period_key_value := TO_CHAR(inv.issue_date, 'YYYY/MM');
  INSERT INTO public.invoice_number_sequences(period_key,last_value) VALUES(period_key_value,1)
  ON CONFLICT(period_key) DO UPDATE SET last_value = public.invoice_number_sequences.last_value + 1, updated_at = NOW()
  RETURNING last_value INTO sequence_value;
  number_value := 'INV/' || period_key_value || '/' || LPAD(sequence_value::TEXT,4,'0');
  UPDATE public.invoices SET status = 'ISSUED', invoice_number = number_value, updated_at = NOW() WHERE id = p_invoice_id;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id,user_name,entity_name,entity_id,action,payload)
  VALUES(auth.uid(),COALESCE(actor_name,'User'),'invoices',p_invoice_id,'INVOICE_ISSUED',jsonb_build_object('invoice_number',number_value));
  RETURN number_value;
END; $$;

CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'publicToken', i.public_token, 'invoiceNumber', i.invoice_number, 'customerName', c.name,
    'customerPhone', c.phone, 'issueDate', i.issue_date, 'dueDate', i.due_date,
    'status', CASE WHEN i.status IN ('ISSUED','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE i.status::TEXT END,
    'subtotal', i.subtotal, 'discount', i.discount, 'total', i.total, 'notes', i.notes,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ii.id, 'descriptionSnapshot', ii.description_snapshot,
      'quantity', ii.quantity, 'unit', ii.unit, 'sellingPriceSnapshot', ii.selling_price_snapshot, 'subtotal', ii.subtotal) ORDER BY ii.created_at)
      FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb),
    'company', jsonb_build_object('name', cp.name, 'address', cp.address, 'phone', cp.phone, 'email', cp.email,
      'website', cp.website, 'bankName', cp.bank_name, 'bankAccount', cp.bank_account, 'bankHolder', cp.bank_holder, 'logoUrl', cp.logo_url)
  )
  FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id
  LEFT JOIN LATERAL (SELECT * FROM public.company_profile ORDER BY created_at LIMIT 1) cp ON TRUE
  WHERE i.public_token = p_token AND i.status NOT IN ('DRAFT', 'VOID');
$$;

CREATE OR REPLACE FUNCTION public.get_invoices_secure(p_invoice_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE role_value public.user_role := public.current_user_role(); result_value JSONB;
BEGIN
  IF role_value IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'createdAt' DESC), '[]'::jsonb) INTO result_value
  FROM (
    SELECT jsonb_build_object(
      'id', i.id, 'publicToken', i.public_token, 'invoiceNumber', i.invoice_number,
      'customerId', i.customer_id, 'customerName', c.name, 'customerPhone', c.phone,
      'issueDate', i.issue_date, 'dueDate', i.due_date,
      'status', CASE WHEN i.status IN ('ISSUED','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE i.status::TEXT END,
      'subtotal', i.subtotal, 'discount', i.discount, 'total', i.total, 'totalPaid', i.total_paid,
      'remainingBalance', i.remaining_balance,
      'totalProductCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.total_product_cost ELSE 0 END,
      'totalDirectCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.total_direct_cost ELSE 0 END,
      'productProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.product_profit ELSE 0 END,
      'transactionProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.transaction_profit ELSE 0 END,
      'transactionMargin', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.transaction_margin ELSE 0 END,
      'notes', i.notes, 'createdBy', i.created_by, 'createdAt', i.created_at, 'updatedAt', i.updated_at,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', ii.id, 'productId', ii.product_id, 'descriptionSnapshot', ii.description_snapshot,
        'quantity', ii.quantity, 'unit', ii.unit, 'sellingPriceSnapshot', ii.selling_price_snapshot,
        'purchasePriceSnapshot', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.purchase_price_snapshot ELSE 0 END,
        'subtotal', ii.subtotal, 'totalPurchaseCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.product_cost_total ELSE 0 END,
        'productProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.profit ELSE 0 END
      ) ORDER BY ii.created_at) FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb),
      'directCosts', CASE WHEN role_value IN ('OWNER','FINANCE') THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', dc.id, 'category', dc.category, 'name', dc.name, 'amount', dc.amount, 'notes', dc.notes
      ) ORDER BY dc.created_at) FROM public.invoice_direct_costs dc WHERE dc.invoice_id = i.id), '[]'::jsonb) ELSE '[]'::jsonb END
    ) AS row_data
    FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id
    WHERE (p_invoice_id IS NULL OR i.id = p_invoice_id)
      AND (role_value IN ('OWNER','FINANCE') OR i.created_by = auth.uid())
  ) rows;
  RETURN result_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_company_profile(p_payload JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile_id UUID; old_data JSONB; actor_name TEXT;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'OWNER'::public.user_role THEN RAISE EXCEPTION 'Hanya Owner yang dapat mengubah profil bisnis'; END IF;
  IF NULLIF(BTRIM(p_payload->>'name'), '') IS NULL THEN RAISE EXCEPTION 'Nama bisnis wajib diisi'; END IF;
  SELECT id, to_jsonb(cp) INTO profile_id, old_data FROM public.company_profile cp ORDER BY created_at LIMIT 1;
  IF profile_id IS NULL THEN
    INSERT INTO public.company_profile(name, address, phone, email, website, npwp, bank_name, bank_account, bank_holder, logo_url)
    VALUES (BTRIM(p_payload->>'name'), p_payload->>'address', p_payload->>'phone', p_payload->>'email', p_payload->>'website', p_payload->>'npwp',
      BTRIM(p_payload->>'bankName'), BTRIM(p_payload->>'bankAccount'), BTRIM(p_payload->>'bankHolder'), NULLIF(BTRIM(p_payload->>'logoUrl'), ''))
    RETURNING id INTO profile_id;
  ELSE
    UPDATE public.company_profile SET name = BTRIM(p_payload->>'name'), address = p_payload->>'address', phone = p_payload->>'phone',
      email = p_payload->>'email', website = p_payload->>'website', npwp = p_payload->>'npwp', bank_name = BTRIM(p_payload->>'bankName'),
      bank_account = BTRIM(p_payload->>'bankAccount'), bank_holder = BTRIM(p_payload->>'bankHolder'), logo_url = NULLIF(BTRIM(p_payload->>'logoUrl'), ''), updated_at = NOW()
    WHERE id = profile_id;
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES(auth.uid(), COALESCE(actor_name, 'Owner'), 'company_profile', profile_id, 'COMPANY_UPDATED', jsonb_build_object('before', old_data));
END; $$;

CREATE OR REPLACE FUNCTION public.set_product_cost(p_product_id UUID, p_supplier_id UUID, p_unit_cost NUMERIC, p_effective_at TIMESTAMPTZ, p_notes TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id UUID := gen_random_uuid(); actor_name TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Akses harga beli ditolak'; END IF;
  IF p_unit_cost IS NULL OR p_unit_cost <= 0 THEN RAISE EXCEPTION 'Harga beli harus lebih dari nol'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id = p_product_id) THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
  UPDATE public.product_costs SET ended_at = COALESCE(p_effective_at, NOW())
  WHERE product_id = p_product_id AND ended_at IS NULL AND effective_at < COALESCE(p_effective_at, NOW());
  INSERT INTO public.product_costs(id, product_id, supplier_id, unit_cost, effective_at, notes)
  VALUES(new_id, p_product_id, p_supplier_id, p_unit_cost, COALESCE(p_effective_at, NOW()), NULLIF(BTRIM(p_notes), ''));
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id,user_name,entity_name,entity_id,action,payload)
  VALUES(auth.uid(),COALESCE(actor_name,'User'),'product_costs',new_id,'PRODUCT_COST_CHANGED',jsonb_build_object('product_id',p_product_id,'unit_cost',p_unit_cost));
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_customer_price(p_customer_id UUID, p_product_id UUID, p_selling_price NUMERIC, p_effective_at TIMESTAMPTZ DEFAULT NOW())
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id UUID := gen_random_uuid(); actor_name TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Akses harga jual ditolak'; END IF;
  IF p_selling_price IS NULL OR p_selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual harus lebih dari nol'; END IF;
  UPDATE public.customer_prices SET ended_at = COALESCE(p_effective_at, NOW())
  WHERE customer_id = p_customer_id AND product_id = p_product_id AND ended_at IS NULL AND effective_at < COALESCE(p_effective_at, NOW());
  INSERT INTO public.customer_prices(id, customer_id, product_id, selling_price, effective_at)
  VALUES(new_id, p_customer_id, p_product_id, p_selling_price, COALESCE(p_effective_at, NOW()));
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id,user_name,entity_name,entity_id,action,payload)
  VALUES(auth.uid(),COALESCE(actor_name,'User'),'customer_prices',new_id,'CUSTOMER_PRICE_CHANGED',jsonb_build_object('customer_id',p_customer_id,'product_id',p_product_id,'selling_price',p_selling_price));
  RETURN new_id;
END; $$;

CREATE OR REPLACE FUNCTION public.audit_master_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_name TEXT; entity_id_value UUID; row_data JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    entity_id_value := OLD.id;
    row_data := to_jsonb(OLD);
  ELSE
    entity_id_value := NEW.id;
    row_data := to_jsonb(NEW);
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id,user_name,entity_name,entity_id,action,payload)
  VALUES(auth.uid(),COALESCE(actor_name,'System'),TG_TABLE_NAME,entity_id_value,UPPER(TG_TABLE_NAME || '_' || TG_OP),row_data);
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS audit_customers_change ON public.customers;
CREATE TRIGGER audit_customers_change AFTER INSERT OR UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.audit_master_change();
DROP TRIGGER IF EXISTS audit_suppliers_change ON public.suppliers;
CREATE TRIGGER audit_suppliers_change AFTER INSERT OR UPDATE OR DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.audit_master_change();
DROP TRIGGER IF EXISTS audit_products_change ON public.products;
CREATE TRIGGER audit_products_change AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.audit_master_change();
DROP TRIGGER IF EXISTS audit_expenses_change ON public.expenses;
CREATE TRIGGER audit_expenses_change AFTER INSERT OR UPDATE OR DELETE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.audit_master_change();

-- Remove every permissive policy left by earlier migrations, then rebuild least-privilege policies.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles','customers','suppliers','products','product_costs','customer_prices','invoices','invoice_items','invoice_direct_costs','payments','expenses','audit_logs','company_profile')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename); END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_direct_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_or_owner_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_user_role() = 'OWNER');
CREATE POLICY approved_master_read ON public.customers FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY approved_suppliers_read ON public.suppliers FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY approved_products_read ON public.products FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY finance_costs_read ON public.product_costs FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY approved_prices_read ON public.customer_prices FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY finance_invoices_read ON public.invoices FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_invoice_items_read ON public.invoice_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (public.current_user_role() IN ('OWNER','FINANCE') OR i.created_by = auth.uid())));
CREATE POLICY finance_direct_costs_read ON public.invoice_direct_costs FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_payments_read ON public.payments FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_expenses_all ON public.expenses FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY owner_audit_read ON public.audit_logs FOR SELECT TO authenticated USING (public.current_user_role() = 'OWNER');
CREATE POLICY approved_company_read ON public.company_profile FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY owner_company_write ON public.company_profile FOR ALL TO authenticated
  USING (public.current_user_role() = 'OWNER') WITH CHECK (public.current_user_role() = 'OWNER');
CREATE POLICY finance_customers_write ON public.customers FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_suppliers_write ON public.suppliers FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_products_write ON public.products FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_costs_write ON public.product_costs FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_prices_write ON public.customer_prices FOR ALL TO authenticated
  USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));

REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoices, public.invoice_items, public.invoice_direct_costs, public.payments, public.audit_logs FROM authenticated;
GRANT EXECUTE ON FUNCTION public.manage_user_approval(UUID, public.profile_status, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_transaction(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_transaction(UUID, NUMERIC, DATE, public.payment_method, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_draft_invoice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_invoice(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoices_secure(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_company_profile(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_product_cost(UUID, UUID, NUMERIC, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_customer_price(UUID, UUID, NUMERIC, TIMESTAMPTZ) TO authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', FALSE, 5242880, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = FALSE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS payment_proofs_insert ON storage.objects;
DROP POLICY IF EXISTS payment_proofs_read ON storage.objects;
DROP POLICY IF EXISTS payment_proofs_delete ON storage.objects;
CREATE POLICY payment_proofs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::TEXT AND public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY payment_proofs_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY payment_proofs_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.current_user_role() IN ('OWNER','FINANCE'));

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('company-assets', 'company-assets', TRUE, 2097152, ARRAY['image/jpeg','image/png','image/webp','image/svg+xml'])
ON CONFLICT (id) DO UPDATE SET public = TRUE, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS company_assets_insert ON storage.objects;
DROP POLICY IF EXISTS company_assets_update ON storage.objects;
DROP POLICY IF EXISTS company_assets_delete ON storage.objects;
CREATE POLICY company_assets_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND public.current_user_role() = 'OWNER');
CREATE POLICY company_assets_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND public.current_user_role() = 'OWNER');
CREATE POLICY company_assets_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-assets' AND public.current_user_role() = 'OWNER');
