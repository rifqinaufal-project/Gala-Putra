-- =========================================================
-- SULTAN SEAFOOD ERP - DATABASE SCHEMA & MIGRATIONS
-- =========================================================

-- Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('OWNER', 'FINANCE', 'STAFF');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE supplier_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM ('CASH', 'TRANSFER', 'CHECK', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE supplier_bill_status AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE direct_cost_category AS ENUM (
    'PACKAGING', 'ICE', 'SHIPPING', 'FUEL', 'TOLL', 'PARKING', 'COURIER', 'PRODUCT_LOSS', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE profile_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. PROFILES (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'STAFF',
  status profile_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CUSTOMERS (Restoran)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  billing_address TEXT NOT NULL,
  shipping_address TEXT,
  payment_term_days INT NOT NULL DEFAULT 7,
  status customer_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status supplier_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  size TEXT,
  default_unit TEXT NOT NULL DEFAULT 'kg',
  default_selling_price NUMERIC(12, 2),
  status product_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. PRODUCT COSTS (HPP History)
CREATE TABLE IF NOT EXISTS public.product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  unit_cost NUMERIC(12, 2) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The deployed additive inventory migration also creates stock_batches,
-- stock_batch_allocations, and product_cost_history for FIFO/audit reporting.

CREATE TABLE IF NOT EXISTS public.customer_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price > 0),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ended_at IS NULL OR ended_at > effective_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_prices_one_active_price
  ON public.customer_prices(customer_id, product_id) WHERE ended_at IS NULL;

-- 7. INVOICES (Header)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  invoice_number TEXT UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status invoice_status NOT NULL DEFAULT 'DRAFT',
  
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  
  total_product_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_direct_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
  product_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transaction_profit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  transaction_margin NUMERIC(5, 2) NOT NULL DEFAULT 0,
  
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. INVOICE ITEMS
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  -- Invoice history is a snapshot. A deleted master product must not delete
  -- or invalidate its invoice items, so the optional reference is nulled.
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  description_snapshot TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL,
  unit TEXT NOT NULL,
  selling_price_snapshot NUMERIC(12, 2) NOT NULL,
  purchase_price_snapshot NUMERIC(12, 2) NOT NULL,
  subtotal NUMERIC(12, 2) NOT NULL,
  product_cost_total NUMERIC(12, 2) NOT NULL,
  profit NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. INVOICE DIRECT COSTS
CREATE TABLE IF NOT EXISTS public.invoice_direct_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  category direct_cost_category NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method payment_method NOT NULL DEFAULT 'TRANSFER',
  reference_number TEXT,
  proof_path TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10A. SUPPLIER BILLS & PAYMENTS (Accounts payable)
CREATE TABLE IF NOT EXISTS public.supplier_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_reference TEXT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status supplier_bill_status NOT NULL DEFAULT 'OPEN',
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
  method payment_method NOT NULL DEFAULT 'TRANSFER',
  reference_number TEXT,
  notes TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_costs_invoice ON public.invoice_direct_costs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON public.supplier_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_status_due_date ON public.supplier_bills(status, due_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_bill ON public.supplier_payments(supplier_bill_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_product ON public.product_costs(product_id);

-- TRIGGER FUNCTION FOR INVOICE NUMBERING
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  month_str TEXT;
  prefix TEXT;
  next_seq INT;
BEGIN
  IF NEW.status != 'DRAFT' AND NEW.invoice_number IS NULL THEN
    year_str := TO_CHAR(NEW.issue_date, 'YYYY');
    month_str := TO_CHAR(NEW.issue_date, 'MM');
    prefix := 'INV/' || year_str || '/' || month_str || '/';

    PERFORM pg_advisory_xact_lock(hashtext(prefix));
    SELECT COALESCE(MAX(split_part(invoice_number, '/', 4)::INT), 0) + 1
    INTO next_seq
    FROM public.invoices
    WHERE invoice_number LIKE prefix || '%';
    
    NEW.invoice_number := prefix || LPAD(next_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_invoice_number ON public.invoices;
CREATE TRIGGER trg_generate_invoice_number
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION generate_invoice_number();

-- RLS POLICIES
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
ALTER TABLE public.supplier_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND status = 'APPROVED';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status = 'APPROVED');
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE POLICY profiles_self_or_owner_read ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.current_user_role() = 'OWNER');
CREATE POLICY approved_customers_read ON public.customers FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY approved_suppliers_read ON public.suppliers FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY approved_products_read ON public.products FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY finance_costs_read ON public.product_costs FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY approved_customer_prices_read ON public.customer_prices FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY finance_invoices_read ON public.invoices FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_invoice_items_read ON public.invoice_items FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_direct_costs_read ON public.invoice_direct_costs FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_payments_read ON public.payments FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_customers_write ON public.customers FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_suppliers_write ON public.suppliers FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY approved_supplier_bills_read ON public.supplier_bills FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY finance_supplier_bills_write ON public.supplier_bills FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY approved_supplier_payments_read ON public.supplier_payments FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY finance_supplier_payments_write ON public.supplier_payments FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_products_write ON public.products FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_costs_write ON public.product_costs FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY finance_customer_prices_write ON public.customer_prices FOR ALL TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE')) WITH CHECK (public.current_user_role() IN ('OWNER','FINANCE'));

-- 13. COMPANY PROFILE
CREATE TABLE IF NOT EXISTS public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Sultan Seafood',
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  npwp TEXT,
  bank_name TEXT NOT NULL DEFAULT 'BCA',
  bank_account TEXT NOT NULL DEFAULT '1234567890',
  bank_holder TEXT NOT NULL DEFAULT 'Sultan Seafood',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Allow anon read company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Allow authenticated insert company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Allow authenticated update company profile" ON public.company_profile;

CREATE POLICY approved_company_read ON public.company_profile FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY owner_company_write ON public.company_profile FOR ALL TO authenticated
  USING (public.current_user_role() = 'OWNER') WITH CHECK (public.current_user_role() = 'OWNER');

-- 15. AUTOMATIC OWNER ASSIGNMENT TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (NEW.id, COALESCE(NEW.email, ''), COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'), 'STAFF', 'PENDING')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
