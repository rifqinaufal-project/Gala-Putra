-- =========================================================
-- SULTAN SEAFOOD ERP - DATABASE SCHEMA & MIGRATIONS
-- =========================================================

-- Enable pgcrypto / uuid extensions
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
  CREATE TYPE direct_cost_category AS ENUM (
    'PACKAGING', 'ICE', 'SHIPPING', 'FUEL', 'TOLL', 'PARKING', 'COURIER', 'PRODUCT_LOSS', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. PROFILES (Extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'STAFF',
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
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
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

-- 7. INVOICES (Header)
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
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
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL,
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
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 16 FOR 4) AS INT)), 0) + 1
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
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_direct_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_user_role(user_id UUID)
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- DROP OLD POLICIES IF RE-RUNNING
DROP POLICY IF EXISTS "Allow authenticated read master data" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated read suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow authenticated read products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated read invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow authenticated read invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Restricted read product costs" ON public.product_costs;
DROP POLICY IF EXISTS "Restricted read invoice direct costs" ON public.invoice_direct_costs;
DROP POLICY IF EXISTS "Allow authenticated insert customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated update customers" ON public.customers;
DROP POLICY IF EXISTS "Allow authenticated insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow authenticated update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow authenticated insert invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Allow authenticated insert invoice direct costs" ON public.invoice_direct_costs;
DROP POLICY IF EXISTS "Allow authenticated insert payments" ON public.payments;

CREATE POLICY "Allow authenticated read master data" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read invoice items" ON public.invoice_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Restricted read product costs" ON public.product_costs
FOR SELECT TO authenticated
USING (get_user_role(auth.uid()) IN ('OWNER', 'FINANCE'));

CREATE POLICY "Restricted read invoice direct costs" ON public.invoice_direct_costs
FOR SELECT TO authenticated
USING (get_user_role(auth.uid()) IN ('OWNER', 'FINANCE'));

CREATE POLICY "Allow authenticated insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert invoice items" ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated insert invoice direct costs" ON public.invoice_direct_costs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (true);
