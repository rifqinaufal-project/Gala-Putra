-- Gala Putra workflow. This migration is additive so a fresh Supabase project
-- can still use the existing auth, invoice, and payment foundation.

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'TPI'
  CHECK (source_type IN ('TPI', 'PERORANGAN', 'LAINNYA'));
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS buyer_type TEXT NOT NULL DEFAULT 'PABRIK'
  CHECK (buyer_type IN ('PABRIK', 'PASAR', 'PERORANGAN', 'LAINNYA'));

ALTER TABLE public.invoice_items
  ALTER COLUMN quantity TYPE NUMERIC(14, 3);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'STANDARD_SALE'
    CHECK (invoice_type IN ('STANDARD_SALE', 'FACTORY_LOAD', 'REJECT_STOCK_SALE')),
  ADD COLUMN IF NOT EXISTS load_id UUID,
  ADD COLUMN IF NOT EXISTS invoice_basis TEXT CHECK (invoice_basis IS NULL OR invoice_basis IN ('DEPARTURE', 'ACCEPTED')),
  ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_invoice_id UUID,
  ADD COLUMN IF NOT EXISTS superseded_by_invoice_id UUID;

DO $$ BEGIN
  CREATE TYPE public.load_status AS ENUM ('DRAFT', 'DISPATCHED', 'RECONCILED', 'VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.load_invoice_basis AS ENUM ('DEPARTURE', 'ACCEPTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reject_stock_movement_type AS ENUM ('REJECT_IN', 'SALE_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.load_number_sequences (
  period_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_number TEXT NOT NULL UNIQUE,
  load_date DATE NOT NULL DEFAULT CURRENT_DATE,
  destination_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE RESTRICT,
  invoice_basis public.load_invoice_basis NOT NULL DEFAULT 'DEPARTURE',
  status public.load_status NOT NULL DEFAULT 'DRAFT',
  total_quantity_kg NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (total_quantity_kg >= 0),
  total_purchase_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_purchase_cost >= 0),
  total_load_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_load_cost >= 0),
  total_accepted_kg NUMERIC(14, 3) CHECK (total_accepted_kg >= 0),
  total_rejected_kg NUMERIC(14, 3) CHECK (total_rejected_kg >= 0),
  notes TEXT,
  dispatched_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.load_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  product_size_snapshot TEXT,
  input_quantity NUMERIC(14, 3) NOT NULL CHECK (input_quantity > 0),
  input_unit TEXT NOT NULL CHECK (input_unit IN ('GRAM', 'KG', 'TON')),
  quantity_kg NUMERIC(14, 3) NOT NULL CHECK (quantity_kg > 0),
  purchase_price_per_kg NUMERIC(14, 2) NOT NULL CHECK (purchase_price_per_kg > 0),
  purchase_total NUMERIC(14, 2) NOT NULL CHECK (purchase_total > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.load_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.supplier_bills
  ADD COLUMN IF NOT EXISTS load_id UUID REFERENCES public.loads(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.load_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID NOT NULL UNIQUE REFERENCES public.loads(id) ON DELETE RESTRICT,
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_sent_kg NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_accepted_kg NUMERIC(14, 3) NOT NULL DEFAULT 0,
  total_rejected_kg NUMERIC(14, 3) NOT NULL DEFAULT 0,
  notes TEXT,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_by UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.load_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES public.load_reconciliations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  sent_quantity_kg NUMERIC(14, 3) NOT NULL CHECK (sent_quantity_kg >= 0),
  accepted_quantity_kg NUMERIC(14, 3) NOT NULL CHECK (accepted_quantity_kg >= 0),
  rejected_quantity_kg NUMERIC(14, 3) NOT NULL CHECK (rejected_quantity_kg >= 0),
  reject_quality TEXT,
  reject_notes TEXT,
  reject_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE(reconciliation_id, product_id),
  CHECK (accepted_quantity_kg + rejected_quantity_kg <= sent_quantity_kg)
);

CREATE TABLE IF NOT EXISTS public.reject_stock_balances (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_kg NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_kg >= 0),
  average_unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (average_unit_cost >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reject_stock_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  reconciliation_item_id UUID NOT NULL REFERENCES public.load_reconciliation_items(id) ON DELETE RESTRICT,
  quantity_received_kg NUMERIC(14, 3) NOT NULL CHECK (quantity_received_kg > 0),
  quantity_remaining_kg NUMERIC(14, 3) NOT NULL CHECK (quantity_remaining_kg >= 0),
  unit_cost_per_kg NUMERIC(14, 2) NOT NULL CHECK (unit_cost_per_kg >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DEPLETED'))
);

CREATE TABLE IF NOT EXISTS public.reject_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type public.reject_stock_movement_type NOT NULL,
  quantity_kg NUMERIC(14, 3) NOT NULL CHECK (quantity_kg <> 0),
  balance_after_kg NUMERIC(14, 3) NOT NULL CHECK (balance_after_kg >= 0),
  load_id UUID REFERENCES public.loads(id) ON DELETE SET NULL,
  reconciliation_item_id UUID REFERENCES public.load_reconciliation_items(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_loads_date ON public.loads(load_date DESC);
CREATE INDEX IF NOT EXISTS idx_load_items_load ON public.load_items(load_id);
CREATE INDEX IF NOT EXISTS idx_load_items_product ON public.load_items(product_id);
CREATE INDEX IF NOT EXISTS idx_load_items_source ON public.load_items(source_id);
CREATE INDEX IF NOT EXISTS idx_reject_stock_movements_product ON public.reject_stock_movements(product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_load ON public.invoices(load_id);

-- Factory invoices and reject-stock invoices never consume the legacy stock
-- balance. They move through their own operational ledgers below.
CREATE OR REPLACE FUNCTION public.apply_invoice_stock_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item_row RECORD; balance_row public.stock_balances%ROWTYPE; requested NUMERIC; available NUMERIC; product_name_value TEXT; actor_name TEXT; direction TEXT;
BEGIN
  IF NEW.invoice_type IN ('FACTORY_LOAD', 'REJECT_STOCK_SALE') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') THEN direction := 'OUT';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') THEN direction := 'OUT';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'VOID' AND OLD.status NOT IN ('DRAFT', 'VOID') THEN direction := 'RETURN';
  ELSE RETURN NEW; END IF;
  IF direction = 'OUT' THEN
    IF EXISTS (SELECT 1 FROM public.stock_movements WHERE invoice_id = NEW.id AND movement_type = 'SALE_OUT') THEN RETURN NEW; END IF;
    INSERT INTO public.stock_balances(product_id) SELECT DISTINCT product_id FROM public.invoice_items WHERE invoice_id = NEW.id AND product_id IS NOT NULL ON CONFLICT DO NOTHING;
    PERFORM sb.product_id FROM public.stock_balances sb WHERE EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.invoice_id = NEW.id AND ii.product_id = sb.product_id) ORDER BY sb.product_id FOR UPDATE;
    SELECT p.name, sb.quantity, req.requested_quantity INTO product_name_value, available, requested FROM public.stock_balances sb JOIN public.products p ON p.id = sb.product_id JOIN (SELECT product_id, SUM(quantity) requested_quantity FROM public.invoice_items WHERE invoice_id = NEW.id GROUP BY product_id) req ON req.product_id = sb.product_id WHERE sb.quantity < req.requested_quantity ORDER BY sb.product_id LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Stok % tidak cukup. Tersedia %, dibutuhkan %', product_name_value, available, requested; END IF;
    FOR item_row IN SELECT ii.* FROM public.invoice_items ii WHERE ii.invoice_id = NEW.id ORDER BY ii.product_id, ii.id LOOP
      UPDATE public.stock_balances SET quantity = quantity - item_row.quantity, updated_at = NOW() WHERE product_id = item_row.product_id RETURNING * INTO balance_row;
      INSERT INTO public.stock_movements(product_id, product_name_snapshot, unit, movement_type, quantity_delta, balance_after, customer_id, invoice_id, invoice_item_id, notes, occurred_at, created_by) VALUES (item_row.product_id, item_row.description_snapshot, item_row.unit, 'SALE_OUT', -item_row.quantity, balance_row.quantity, NEW.customer_id, NEW.id, item_row.id, COALESCE(NEW.invoice_number, 'Invoice'), NEW.issue_date, auth.uid());
    END LOOP;
  ELSE
    FOR item_row IN SELECT sm.* FROM public.stock_movements sm WHERE sm.invoice_id = NEW.id AND sm.movement_type = 'SALE_OUT' ORDER BY sm.product_id, sm.id LOOP
      UPDATE public.stock_balances SET quantity = quantity + ABS(item_row.quantity_delta), updated_at = NOW() WHERE product_id = item_row.product_id RETURNING * INTO balance_row;
      INSERT INTO public.stock_movements(product_id, product_name_snapshot, unit, movement_type, quantity_delta, balance_after, customer_id, invoice_id, invoice_item_id, notes, occurred_at, created_by) VALUES (item_row.product_id, item_row.product_name_snapshot, item_row.unit, 'INVOICE_VOID_RETURN', ABS(item_row.quantity_delta), balance_row.quantity, item_row.customer_id, NEW.id, item_row.invoice_item_id, 'Pengembalian invoice dibatalkan', NOW(), auth.uid());
    END LOOP;
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload) VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', NEW.id, CASE WHEN direction = 'OUT' THEN 'STOCK_SALE_OUT' ELSE 'STOCK_VOID_RETURN' END, jsonb_build_object('invoice_number', NEW.invoice_number));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.next_gala_load_number(p_date DATE) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE period_key TEXT := TO_CHAR(p_date, 'YYYY/MM'); sequence_value INTEGER;
BEGIN
  INSERT INTO public.load_number_sequences(period_key, last_value) VALUES (period_key, 1)
  ON CONFLICT (period_key) DO UPDATE SET last_value = load_number_sequences.last_value + 1, updated_at = NOW()
  RETURNING last_value INTO sequence_value;
  RETURN 'MUA/' || period_key || '/' || LPAD(sequence_value::TEXT, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.create_load_transaction(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_role public.user_role := public.current_user_role(); load_id_value UUID := gen_random_uuid(); load_number_value TEXT; invoice_id_value UUID := gen_random_uuid(); invoice_number_value TEXT; source_row RECORD; item JSONB; product_row public.products%ROWTYPE; destination_row public.customers%ROWTYPE; load_date_value DATE := COALESCE(NULLIF(p_payload->>'loadDate','')::DATE, CURRENT_DATE); basis public.load_invoice_basis := COALESCE((p_payload->>'invoiceBasis')::public.load_invoice_basis, 'DEPARTURE'); total_kg NUMERIC := 0; purchase_total NUMERIC := 0; load_cost_total NUMERIC := 0; row_kg NUMERIC; row_price NUMERIC; row_total NUMERIC; subtotal_value NUMERIC := 0; invoice_item_id UUID; selling_price NUMERIC; period_key TEXT; sequence_value INTEGER; actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat membuat muatan'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]')) = 0 THEN RAISE EXCEPTION 'Muatan harus memiliki minimal satu item'; END IF;
  SELECT * INTO destination_row FROM public.customers WHERE id = (p_payload->>'destinationId')::UUID AND status = 'ACTIVE' AND buyer_type = 'PABRIK';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pabrik tujuan aktif tidak ditemukan'; END IF;
  INSERT INTO public.invoices(id,public_token,invoice_number,customer_id,issue_date,due_date,status,subtotal,discount,total,total_paid,remaining_balance,total_product_cost,total_direct_cost,product_profit,transaction_profit,transaction_margin,notes,created_by,invoice_type,load_id,invoice_basis,is_estimate) VALUES (invoice_id_value,gen_random_uuid(),invoice_number_value,destination_row.id,load_date_value,load_date_value + destination_row.payment_term_days,'ISSUED',0,0,0,0,0,0,load_cost_total,0,-load_cost_total,0,NULLIF(BTRIM(p_payload->>'notes'),''),auth.uid(),'FACTORY_LOAD',load_id_value,basis,basis='ACCEPTED');
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    row_kg := ROUND(COALESCE((item->>'quantity')::NUMERIC,0) * CASE item->>'unit' WHEN 'GRAM' THEN 0.001 WHEN 'KG' THEN 1 WHEN 'TON' THEN 1000 ELSE 0 END, 3);
    row_price := ROUND(COALESCE((item->>'purchasePricePerKg')::NUMERIC,0), 2);
    IF row_kg <= 0 OR row_price <= 0 THEN RAISE EXCEPTION 'Berat dan harga beli per kg harus lebih dari nol'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = (item->>'sourceId')::UUID AND status = 'ACTIVE') THEN RAISE EXCEPTION 'TPI/sumber aktif tidak ditemukan'; END IF;
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    total_kg := total_kg + row_kg; row_total := ROUND(row_kg * row_price, 2); purchase_total := purchase_total + row_total;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs','[]')) LOOP
    IF COALESCE((item->>'amount')::NUMERIC,0) <= 0 OR NULLIF(BTRIM(item->>'name'),'') IS NULL THEN RAISE EXCEPTION 'Biaya muatan tidak valid'; END IF;
    load_cost_total := load_cost_total + ROUND((item->>'amount')::NUMERIC,2);
  END LOOP;
  load_number_value := public.next_gala_load_number(load_date_value);
  period_key := TO_CHAR(load_date_value,'YYYY/MM');
  INSERT INTO public.invoice_number_sequences(period_key,last_value) VALUES (period_key,1) ON CONFLICT (period_key) DO UPDATE SET last_value = invoice_number_sequences.last_value + 1, updated_at = NOW() RETURNING last_value INTO sequence_value;
  invoice_number_value := 'INV/' || period_key || '/' || LPAD(sequence_value::TEXT,4,'0');
  INSERT INTO public.loads(id,load_number,load_date,destination_id,invoice_basis,status,total_quantity_kg,total_purchase_cost,total_load_cost,notes,dispatched_at,created_by) VALUES (load_id_value,load_number_value,load_date_value,destination_row.id,basis,'DISPATCHED',total_kg,purchase_total,load_cost_total,NULLIF(BTRIM(p_payload->>'notes'),''),NOW(),auth.uid());
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    row_kg := ROUND((item->>'quantity')::NUMERIC * CASE item->>'unit' WHEN 'GRAM' THEN 0.001 WHEN 'KG' THEN 1 WHEN 'TON' THEN 1000 ELSE 0 END,3); row_price := ROUND((item->>'purchasePricePerKg')::NUMERIC,2);
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID;
    INSERT INTO public.load_items(load_id,source_id,product_id,product_name_snapshot,product_size_snapshot,input_quantity,input_unit,quantity_kg,purchase_price_per_kg,purchase_total,notes) VALUES (load_id_value,(item->>'sourceId')::UUID,product_row.id,product_row.name,product_row.size,(item->>'quantity')::NUMERIC,item->>'unit',row_kg,row_price,ROUND(row_kg*row_price,2),NULLIF(BTRIM(item->>'notes'),''));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'costs','[]')) LOOP INSERT INTO public.load_costs(load_id,category,name,amount,notes) VALUES (load_id_value,item->>'category',LEFT(BTRIM(item->>'name'),120),ROUND((item->>'amount')::NUMERIC,2),NULLIF(BTRIM(item->>'notes'),'')); END LOOP;
  FOR source_row IN SELECT source_id, ROUND(SUM(purchase_total),2) total FROM public.load_items WHERE load_id = load_id_value GROUP BY source_id LOOP
    INSERT INTO public.supplier_bill_number_sequences(period_key,last_value) VALUES (period_key,1) ON CONFLICT (period_key) DO UPDATE SET last_value=supplier_bill_number_sequences.last_value+1,updated_at=NOW() RETURNING last_value INTO sequence_value;
    INSERT INTO public.supplier_bills(bill_number,supplier_id,load_id,bill_date,due_date,status,total,total_paid,remaining_balance,notes,created_by) VALUES ('HTG/'||period_key||'/'||LPAD(sequence_value::TEXT,4,'0'),source_row.source_id,load_id_value,load_date_value,load_date_value + 7,'OPEN',source_row.total,0,source_row.total,'Pembelian pada '||load_number_value,auth.uid());
  END LOOP;
  -- A factory invoice uses the departure quantity initially. The accepted-basis
  -- invoice is marked estimate and is replaced after reconciliation.
  FOR source_row IN SELECT product_id, product_name_snapshot, ROUND(SUM(quantity_kg),3) quantity_kg, ROUND(SUM(purchase_total) / NULLIF(SUM(quantity_kg),0),2) cost FROM public.load_items WHERE load_id = load_id_value GROUP BY product_id, product_name_snapshot LOOP
    SELECT COALESCE((SELECT cp.selling_price FROM public.customer_prices cp WHERE cp.customer_id = destination_row.id AND cp.product_id = source_row.product_id AND cp.ended_at IS NULL ORDER BY cp.effective_at DESC LIMIT 1),p.default_selling_price) INTO selling_price FROM public.products p WHERE p.id = source_row.product_id;
    IF selling_price IS NULL OR selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual % belum tersedia', source_row.product_name_snapshot; END IF;
    subtotal_value := subtotal_value + ROUND(source_row.quantity_kg * selling_price,2);
    invoice_item_id := gen_random_uuid();
    INSERT INTO public.invoice_items(id,invoice_id,product_id,description_snapshot,quantity,margin_quantity,unit,selling_price_snapshot,purchase_price_snapshot,subtotal,product_cost_total,profit) VALUES (invoice_item_id,invoice_id_value,source_row.product_id,source_row.product_name_snapshot,source_row.quantity_kg,0,'kg',selling_price,source_row.cost,ROUND(source_row.quantity_kg*selling_price,2),ROUND(source_row.quantity_kg*source_row.cost,2),ROUND(source_row.quantity_kg*(selling_price-source_row.cost),2));
  END LOOP;
  UPDATE public.invoices SET subtotal=subtotal_value,total=subtotal_value,remaining_balance=subtotal_value,total_product_cost=(SELECT ROUND(COALESCE(SUM(product_cost_total),0),2) FROM public.invoice_items WHERE invoice_id=invoice_id_value),product_profit=subtotal_value-(SELECT ROUND(COALESCE(SUM(product_cost_total),0),2) FROM public.invoice_items WHERE invoice_id=invoice_id_value),transaction_profit=subtotal_value-(SELECT ROUND(COALESCE(SUM(product_cost_total),0),2) FROM public.invoice_items WHERE invoice_id=invoice_id_value)-load_cost_total,transaction_margin=CASE WHEN subtotal_value=0 THEN 0 ELSE ROUND(((subtotal_value-(SELECT COALESCE(SUM(product_cost_total),0) FROM public.invoice_items WHERE invoice_id=invoice_id_value)-load_cost_total)/subtotal_value)*100,2) END,updated_at=NOW() WHERE id=invoice_id_value;
  UPDATE public.loads SET invoice_id=invoice_id_value,status = 'DISPATCHED', updated_at = NOW() WHERE id = load_id_value;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id,user_name,entity_name,entity_id,action,payload) VALUES (auth.uid(),COALESCE(actor_name,'User'),'loads',load_id_value,'LOAD_DISPATCHED',jsonb_build_object('load_number',load_number_value,'total_kg',total_kg,'invoice_number',invoice_number_value));
  RETURN jsonb_build_object('loadId',load_id_value,'loadNumber',load_number_value,'invoiceId',invoice_id_value,'invoiceNumber',invoice_number_value,'totalKg',total_kg);
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_load_reconciliation_transaction(p_load_id UUID, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_role public.user_role := public.current_user_role(); load_row public.loads%ROWTYPE; item JSONB; reconciliation_item RECORD; sent NUMERIC; accepted NUMERIC; rejected NUMERIC; cost NUMERIC; rec_id UUID := gen_random_uuid(); rec_item_id UUID; total_sent NUMERIC := 0; total_accepted NUMERIC := 0; total_rejected NUMERIC := 0; invoice_row public.invoices%ROWTYPE; new_invoice_id UUID := gen_random_uuid(); new_invoice_number TEXT; sequence_value INTEGER; period_key TEXT; product_name_value TEXT; subtotal_value NUMERIC := 0; product_cost_value NUMERIC := 0; selling_price NUMERIC; actor_name TEXT;
BEGIN
  IF actor_role NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat melakukan rekonsiliasi'; END IF;
  SELECT * INTO load_row FROM public.loads WHERE id = p_load_id FOR UPDATE;
  IF NOT FOUND OR load_row.status <> 'DISPATCHED' THEN RAISE EXCEPTION 'Muatan tidak tersedia untuk direkonsiliasi'; END IF;
  IF EXISTS (SELECT 1 FROM public.load_reconciliations WHERE load_id = p_load_id) THEN RAISE EXCEPTION 'Muatan sudah direkonsiliasi'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]')) = 0 THEN RAISE EXCEPTION 'Hasil pabrik belum diisi'; END IF;
  INSERT INTO public.load_reconciliations(id,load_id,reconciliation_date,total_sent_kg,notes,finalized_by) VALUES (rec_id,p_load_id,COALESCE(NULLIF(p_payload->>'reconciliationDate','')::DATE,CURRENT_DATE),load_row.total_quantity_kg,NULLIF(BTRIM(p_payload->>'notes'),''),auth.uid());
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    SELECT ROUND(SUM(quantity_kg),3) INTO sent FROM public.load_items WHERE load_id=p_load_id AND product_id=(item->>'productId')::UUID;
    IF sent IS NULL THEN RAISE EXCEPTION 'Produk rekonsiliasi tidak ada di muatan'; END IF;
    accepted := ROUND(COALESCE((item->>'acceptedQuantityKg')::NUMERIC,0),3); rejected := ROUND(COALESCE((item->>'rejectedQuantityKg')::NUMERIC,0),3);
    IF accepted < 0 OR rejected < 0 OR accepted + rejected > sent THEN RAISE EXCEPTION 'Berat diterima dan reject untuk % tidak valid', item->>'productId'; END IF;
    SELECT product_name_snapshot INTO product_name_value FROM public.load_items WHERE load_id=p_load_id AND product_id=(item->>'productId')::UUID LIMIT 1;
    SELECT ROUND(SUM(purchase_total)/NULLIF(SUM(quantity_kg),0),2) INTO cost FROM public.load_items WHERE load_id=p_load_id AND product_id=(item->>'productId')::UUID;
    rec_item_id := gen_random_uuid();
    INSERT INTO public.load_reconciliation_items(id,reconciliation_id,product_id,product_name_snapshot,sent_quantity_kg,accepted_quantity_kg,rejected_quantity_kg,reject_quality,reject_notes,reject_value) VALUES (rec_item_id,(rec_id),(item->>'productId')::UUID,product_name_value,sent,accepted,rejected,NULLIF(BTRIM(item->>'rejectQuality'),''),NULLIF(BTRIM(item->>'rejectNotes'),''),ROUND(rejected*cost,2));
    total_sent := total_sent + sent; total_accepted := total_accepted + accepted; total_rejected := total_rejected + rejected;
    IF rejected > 0 THEN
      INSERT INTO public.reject_stock_balances(product_id,quantity_kg,average_unit_cost) VALUES ((item->>'productId')::UUID,rejected,cost) ON CONFLICT (product_id) DO UPDATE SET average_unit_cost=ROUND(((reject_stock_balances.quantity_kg*reject_stock_balances.average_unit_cost)+(rejected*cost))/(reject_stock_balances.quantity_kg+rejected),2),quantity_kg=reject_stock_balances.quantity_kg+rejected,updated_at=NOW();
      INSERT INTO public.reject_stock_lots(product_id,reconciliation_item_id,quantity_received_kg,quantity_remaining_kg,unit_cost_per_kg) VALUES ((item->>'productId')::UUID,rec_item_id,rejected,rejected,cost);
      INSERT INTO public.reject_stock_movements(product_id,movement_type,quantity_kg,balance_after_kg,load_id,reconciliation_item_id,notes,created_by) SELECT (item->>'productId')::UUID,'REJECT_IN',rejected,quantity_kg,p_load_id,rec_item_id,COALESCE(NULLIF(BTRIM(item->>'rejectQuality'),''),'Reject pabrik'),auth.uid() FROM public.reject_stock_balances WHERE product_id=(item->>'productId')::UUID;
    END IF;
  END LOOP;
  UPDATE public.load_reconciliations SET total_accepted_kg=total_accepted,total_rejected_kg=total_rejected WHERE id=rec_id;
  UPDATE public.loads SET status='RECONCILED',total_accepted_kg=total_accepted,total_rejected_kg=total_rejected,reconciled_at=NOW(),updated_at=NOW() WHERE id=p_load_id;
  SELECT * INTO invoice_row FROM public.invoices WHERE id=load_row.invoice_id FOR UPDATE;
  IF load_row.invoice_basis = 'ACCEPTED' THEN
    period_key := TO_CHAR(invoice_row.issue_date,'YYYY/MM');
    INSERT INTO public.invoice_number_sequences(period_key,last_value) VALUES (period_key,1) ON CONFLICT (period_key) DO UPDATE SET last_value=invoice_number_sequences.last_value+1,updated_at=NOW() RETURNING last_value INTO sequence_value;
    new_invoice_number := 'INV/'||period_key||'/'||LPAD(sequence_value::TEXT,4,'0');
    INSERT INTO public.invoices(id,public_token,invoice_number,customer_id,issue_date,due_date,status,subtotal,discount,total,total_paid,remaining_balance,total_product_cost,total_direct_cost,product_profit,transaction_profit,transaction_margin,notes,created_by,invoice_type,load_id,invoice_basis,is_estimate,revision_number,original_invoice_id) VALUES (new_invoice_id,gen_random_uuid(),new_invoice_number,invoice_row.customer_id,invoice_row.issue_date,invoice_row.due_date,'ISSUED',0,0,0,0,0,0,invoice_row.total_direct_cost,0,-invoice_row.total_direct_cost,0,invoice_row.notes,auth.uid(),'FACTORY_LOAD',p_load_id,'ACCEPTED',FALSE,invoice_row.revision_number+1,invoice_row.id);
    FOR reconciliation_item IN SELECT * FROM public.load_reconciliation_items WHERE reconciliation_id=rec_id LOOP
      SELECT COALESCE((SELECT cp.selling_price FROM public.customer_prices cp WHERE cp.customer_id=invoice_row.customer_id AND cp.product_id=reconciliation_item.product_id AND cp.ended_at IS NULL ORDER BY cp.effective_at DESC LIMIT 1),p.default_selling_price) INTO selling_price FROM public.products p WHERE p.id=reconciliation_item.product_id;
      product_cost_value := product_cost_value + ROUND(reconciliation_item.accepted_quantity_kg*(SELECT ROUND(SUM(purchase_total)/NULLIF(SUM(quantity_kg),0),2) FROM public.load_items WHERE load_id=p_load_id AND product_id=reconciliation_item.product_id),2);
      subtotal_value := subtotal_value + ROUND(reconciliation_item.accepted_quantity_kg*selling_price,2);
      INSERT INTO public.invoice_items(invoice_id,product_id,description_snapshot,quantity,margin_quantity,unit,selling_price_snapshot,purchase_price_snapshot,subtotal,product_cost_total,profit) VALUES (new_invoice_id,reconciliation_item.product_id,reconciliation_item.product_name_snapshot,reconciliation_item.accepted_quantity_kg,0,'kg',selling_price,(SELECT ROUND(SUM(purchase_total)/NULLIF(SUM(quantity_kg),0),2) FROM public.load_items WHERE load_id=p_load_id AND product_id=reconciliation_item.product_id),ROUND(reconciliation_item.accepted_quantity_kg*selling_price,2),ROUND(reconciliation_item.accepted_quantity_kg*(SELECT ROUND(SUM(purchase_total)/NULLIF(SUM(quantity_kg),0),2) FROM public.load_items WHERE load_id=p_load_id AND product_id=reconciliation_item.product_id),2),ROUND(reconciliation_item.accepted_quantity_kg*(selling_price-(SELECT ROUND(SUM(purchase_total)/NULLIF(SUM(quantity_kg),0),2) FROM public.load_items WHERE load_id=p_load_id AND product_id=reconciliation_item.product_id)),2));
    END LOOP;
    UPDATE public.invoices SET subtotal=subtotal_value,total=subtotal_value,remaining_balance=subtotal_value,total_product_cost=product_cost_value,product_profit=subtotal_value-product_cost_value,transaction_profit=subtotal_value-product_cost_value-invoice_row.total_direct_cost,transaction_margin=CASE WHEN subtotal_value=0 THEN 0 ELSE ROUND(((subtotal_value-product_cost_value-invoice_row.total_direct_cost)/subtotal_value)*100,2) END,updated_at=NOW() WHERE id=new_invoice_id;
    UPDATE public.invoices SET status='VOID',superseded_by_invoice_id=new_invoice_id,updated_at=NOW() WHERE id=invoice_row.id;
    UPDATE public.loads SET invoice_id=new_invoice_id WHERE id=p_load_id;
  ELSE
    -- Departure-basis revenue stays on the original invoice, while HPP is
    -- restated to the accepted quantity and rejected value becomes stock.
    FOR reconciliation_item IN SELECT * FROM public.load_reconciliation_items WHERE reconciliation_id=rec_id LOOP
      SELECT ROUND(SUM(purchase_total)/NULLIF(SUM(quantity_kg),0),2) INTO cost FROM public.load_items WHERE load_id=p_load_id AND product_id=reconciliation_item.product_id;
      UPDATE public.invoice_items SET product_cost_total=ROUND(reconciliation_item.accepted_quantity_kg*cost,2),profit=subtotal-ROUND(reconciliation_item.accepted_quantity_kg*cost,2) WHERE invoice_id=invoice_row.id AND product_id=reconciliation_item.product_id;
    END LOOP;
    SELECT ROUND(COALESCE(SUM(product_cost_total),0),2) INTO product_cost_value FROM public.invoice_items WHERE invoice_id=invoice_row.id;
    UPDATE public.invoices SET total_product_cost=product_cost_value,product_profit=total-product_cost_value,transaction_profit=total-product_cost_value-total_direct_cost,transaction_margin=CASE WHEN total=0 THEN 0 ELSE ROUND(((total-product_cost_value-total_direct_cost)/total)*100,2) END,updated_at=NOW() WHERE id=invoice_row.id;
  END IF;
  SELECT full_name INTO actor_name FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.audit_logs(user_id,user_name,entity_name,entity_id,action,payload) VALUES (auth.uid(),COALESCE(actor_name,'User'),'loads',p_load_id,'LOAD_RECONCILED',jsonb_build_object('total_accepted_kg',total_accepted,'total_rejected_kg',total_rejected,'invoice_id',new_invoice_id));
  RETURN jsonb_build_object('reconciliationId',rec_id,'totalAcceptedKg',total_accepted,'totalRejectedKg',total_rejected,'invoiceId',CASE WHEN load_row.invoice_basis='ACCEPTED' THEN new_invoice_id ELSE invoice_row.id END);
END; $$;

CREATE OR REPLACE FUNCTION public.create_reject_stock_sale_transaction(p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor_role public.user_role := public.current_user_role(); invoice_id_value UUID := gen_random_uuid(); customer_row public.customers%ROWTYPE; item JSONB; balance_row public.reject_stock_balances%ROWTYPE; v_quantity_kg NUMERIC; selling_price NUMERIC; hpp NUMERIC; subtotal_value NUMERIC := 0; cost_value NUMERIC := 0; invoice_number_value TEXT; period_key TEXT; sequence_value INTEGER; product_row public.products%ROWTYPE;
BEGIN
  IF actor_role NOT IN ('OWNER','FINANCE') THEN RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menjual stok reject'; END IF;
  SELECT * INTO customer_row FROM public.customers WHERE id=(p_payload->>'customerId')::UUID AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pembeli aktif tidak ditemukan'; END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items','[]'))=0 THEN RAISE EXCEPTION 'Invoice harus memiliki minimal satu item'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) item GROUP BY item->>'productId' HAVING COUNT(*) > 1) THEN RAISE EXCEPTION 'Produk yang sama cukup dicatat satu kali'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    v_quantity_kg := ROUND(COALESCE((item->>'quantity')::NUMERIC,0)*CASE item->>'unit' WHEN 'GRAM' THEN 0.001 WHEN 'KG' THEN 1 WHEN 'TON' THEN 1000 ELSE 0 END,3);
    SELECT * INTO balance_row FROM public.reject_stock_balances WHERE product_id=(item->>'productId')::UUID FOR UPDATE;
    IF NOT FOUND OR v_quantity_kg <= 0 OR v_quantity_kg > balance_row.quantity_kg THEN RAISE EXCEPTION 'Stok reject tidak cukup'; END IF;
    selling_price := ROUND(COALESCE((item->>'sellingPricePerKg')::NUMERIC,0),2); IF selling_price <= 0 THEN RAISE EXCEPTION 'Harga jual per kg harus lebih dari nol'; END IF;
    SELECT * INTO product_row FROM public.products WHERE id=balance_row.product_id;
    subtotal_value := subtotal_value + ROUND(v_quantity_kg*selling_price,2); cost_value := cost_value + ROUND(v_quantity_kg*balance_row.average_unit_cost,2);
  END LOOP;
  period_key := TO_CHAR(COALESCE(NULLIF(p_payload->>'issueDate','')::DATE,CURRENT_DATE),'YYYY/MM');
  INSERT INTO public.invoice_number_sequences(period_key,last_value) VALUES (period_key,1) ON CONFLICT (period_key) DO UPDATE SET last_value=invoice_number_sequences.last_value+1,updated_at=NOW() RETURNING last_value INTO sequence_value;
  invoice_number_value := 'INV/'||period_key||'/'||LPAD(sequence_value::TEXT,4,'0');
  INSERT INTO public.invoices(id,public_token,invoice_number,customer_id,issue_date,due_date,status,subtotal,discount,total,total_paid,remaining_balance,total_product_cost,total_direct_cost,product_profit,transaction_profit,transaction_margin,notes,created_by,invoice_type,is_estimate) VALUES (invoice_id_value,gen_random_uuid(),invoice_number_value,customer_row.id,COALESCE(NULLIF(p_payload->>'issueDate','')::DATE,CURRENT_DATE),COALESCE(NULLIF(p_payload->>'dueDate','')::DATE,CURRENT_DATE+customer_row.payment_term_days),'ISSUED',subtotal_value,0,subtotal_value,0,subtotal_value,cost_value,0,subtotal_value-cost_value,subtotal_value-cost_value,CASE WHEN subtotal_value=0 THEN 0 ELSE ROUND((subtotal_value-cost_value)/subtotal_value*100,2) END,NULLIF(BTRIM(p_payload->>'notes'),''),auth.uid(),'REJECT_STOCK_SALE',FALSE);
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    v_quantity_kg := ROUND((item->>'quantity')::NUMERIC*CASE item->>'unit' WHEN 'GRAM' THEN 0.001 WHEN 'KG' THEN 1 WHEN 'TON' THEN 1000 ELSE 0 END,3);
    SELECT * INTO balance_row FROM public.reject_stock_balances WHERE product_id=(item->>'productId')::UUID FOR UPDATE; SELECT * INTO product_row FROM public.products WHERE id=balance_row.product_id;
    selling_price := ROUND((item->>'sellingPricePerKg')::NUMERIC,2); hpp := balance_row.average_unit_cost;
    INSERT INTO public.invoice_items(invoice_id,product_id,description_snapshot,quantity,margin_quantity,unit,selling_price_snapshot,purchase_price_snapshot,subtotal,product_cost_total,profit) VALUES (invoice_id_value,product_row.id,product_row.name||CASE WHEN product_row.size IS NULL THEN '' ELSE ' ['||product_row.size||']' END,v_quantity_kg,0,'kg',selling_price, hpp,ROUND(v_quantity_kg*selling_price,2),ROUND(v_quantity_kg*hpp,2),ROUND(v_quantity_kg*(selling_price-hpp),2));
    UPDATE public.reject_stock_balances SET quantity_kg=reject_stock_balances.quantity_kg-v_quantity_kg,updated_at=NOW() WHERE product_id=product_row.id;
    INSERT INTO public.reject_stock_movements(product_id,movement_type,quantity_kg,balance_after_kg,invoice_id,notes,created_by) SELECT product_row.id,'SALE_OUT',-v_quantity_kg,reject_stock_balances.quantity_kg,invoice_id_value,'Penjualan stok reject',auth.uid() FROM public.reject_stock_balances WHERE product_id=product_row.id;
  END LOOP;
  RETURN jsonb_build_object('invoiceId',invoice_id_value,'invoiceNumber',invoice_number_value);
END; $$;

ALTER TABLE public.loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reject_stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reject_stock_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reject_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY gala_loads_read ON public.loads FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY gala_load_items_read ON public.load_items FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY gala_load_costs_read ON public.load_costs FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY gala_reconciliation_read ON public.load_reconciliations FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY gala_reconciliation_items_read ON public.load_reconciliation_items FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY gala_reject_balances_read ON public.reject_stock_balances FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY gala_reject_lots_read ON public.reject_stock_lots FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));
CREATE POLICY gala_reject_movements_read ON public.reject_stock_movements FOR SELECT TO authenticated USING (public.current_user_role() IN ('OWNER','FINANCE'));

REVOKE ALL ON FUNCTION public.next_gala_load_number(DATE), public.create_load_transaction(JSONB), public.finalize_load_reconciliation_transaction(UUID,JSONB), public.create_reject_stock_sale_transaction(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_load_transaction(JSONB), public.finalize_load_reconciliation_transaction(UUID,JSONB), public.create_reject_stock_sale_transaction(JSONB) TO authenticated;
