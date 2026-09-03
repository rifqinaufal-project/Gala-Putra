-- Inventory ledger, supplier receipts, and atomic invoice stock movements.
-- Stock is reduced only when an invoice is issued and restored when an
-- issued invoice is voided. Draft invoices never reserve stock.

DO $$ BEGIN
  CREATE TYPE public.stock_movement_type AS ENUM (
    'PURCHASE_IN', 'SALE_OUT', 'INVOICE_VOID_RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.stock_balances (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  minimum_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (minimum_quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_receipt_number_sequences (
  period_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL CHECK (last_value > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_bill_id UUID UNIQUE REFERENCES public.supplier_bills(id) ON DELETE RESTRICT,
  supplier_reference TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.stock_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost > 0),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  unit TEXT NOT NULL,
  movement_type public.stock_movement_type NOT NULL,
  quantity_delta NUMERIC(14, 3) NOT NULL CHECK (quantity_delta <> 0),
  balance_after NUMERIC(14, 3) NOT NULL CHECK (balance_after >= 0),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_item_id UUID REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  receipt_id UUID REFERENCES public.stock_receipts(id) ON DELETE SET NULL,
  receipt_item_id UUID REFERENCES public.stock_receipt_items(id) ON DELETE SET NULL,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_receipts_supplier_date
  ON public.stock_receipts(supplier_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_receipt_items_receipt
  ON public.stock_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_stock_receipt_items_product
  ON public.stock_receipt_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
  ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_invoice
  ON public.stock_movements(invoice_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_supplier
  ON public.stock_movements(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_customer
  ON public.stock_movements(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_invoice_item_type_key
  ON public.stock_movements(invoice_item_id, movement_type)
  WHERE invoice_item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_receipt_item_type_key
  ON public.stock_movements(receipt_item_id, movement_type)
  WHERE receipt_item_id IS NOT NULL;

-- Every product gets a balance row. This keeps stock reads simple and lets
-- invoice/receipt functions lock all affected rows deterministically.
CREATE OR REPLACE FUNCTION public.initialize_product_stock_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.stock_balances(product_id) VALUES (NEW.id)
  ON CONFLICT (product_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_initialize_product_stock_balance ON public.products;
CREATE TRIGGER trg_initialize_product_stock_balance
AFTER INSERT ON public.products
FOR EACH ROW EXECUTE FUNCTION public.initialize_product_stock_balance();

INSERT INTO public.stock_balances(product_id)
SELECT id FROM public.products
ON CONFLICT (product_id) DO NOTHING;

-- The deferred constraint trigger runs after invoice_items have been inserted
-- by create_invoice_transaction, while still remaining part of the same RPC
-- transaction. It therefore also covers direct ISSUED invoice creation.
CREATE OR REPLACE FUNCTION public.apply_invoice_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row RECORD;
  balance_row public.stock_balances%ROWTYPE;
  product_row public.products%ROWTYPE;
  requested_quantity NUMERIC;
  available_quantity NUMERIC;
  product_name_value TEXT;
  new_quantity NUMERIC;
  actor_name TEXT;
  change_direction TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') THEN
    change_direction := 'OUT';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') THEN
    change_direction := 'OUT';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'VOID' AND OLD.status NOT IN ('DRAFT', 'VOID') THEN
    change_direction := 'RETURN';
  ELSE
    RETURN NEW;
  END IF;

  IF change_direction = 'OUT' THEN
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE invoice_id = NEW.id AND movement_type = 'SALE_OUT'
    ) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = NEW.id AND product_id IS NULL) THEN
      RAISE EXCEPTION 'Invoice memiliki produk yang sudah tidak tersedia';
    END IF;

    INSERT INTO public.stock_balances(product_id)
    SELECT DISTINCT product_id FROM public.invoice_items
    WHERE invoice_id = NEW.id AND product_id IS NOT NULL
    ON CONFLICT (product_id) DO NOTHING;

    -- Lock all products in UUID order to avoid deadlocks between invoices.
    PERFORM sb.product_id
    FROM public.stock_balances sb
    JOIN (
      SELECT DISTINCT product_id FROM public.invoice_items
      WHERE invoice_id = NEW.id AND product_id IS NOT NULL
    ) products ON products.product_id = sb.product_id
    ORDER BY sb.product_id
    FOR UPDATE;

    SELECT p.name, sb.quantity, req.requested_quantity
    INTO product_name_value, available_quantity, requested_quantity
    FROM public.stock_balances sb
    JOIN public.products p ON p.id = sb.product_id
    JOIN (
      SELECT product_id, SUM(quantity) AS requested_quantity
      FROM public.invoice_items
      WHERE invoice_id = NEW.id
      GROUP BY product_id
    ) req ON req.product_id = sb.product_id
    WHERE sb.quantity < req.requested_quantity
    ORDER BY sb.product_id
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Stok % tidak cukup. Tersedia %, dibutuhkan %', product_name_value, available_quantity, requested_quantity;
    END IF;

    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    FOR item_row IN
      SELECT ii.*, p.name AS current_product_name, p.default_unit AS current_unit,
             NEW.customer_id AS invoice_customer_id
      FROM public.invoice_items ii
      JOIN public.products p ON p.id = ii.product_id
      WHERE ii.invoice_id = NEW.id
      ORDER BY ii.product_id, ii.id
    LOOP
      UPDATE public.stock_balances
      SET quantity = quantity - item_row.quantity, updated_at = NOW()
      WHERE product_id = item_row.product_id
      RETURNING * INTO balance_row;

      INSERT INTO public.stock_movements(
        product_id, product_name_snapshot, unit, movement_type, quantity_delta,
        balance_after, customer_id, invoice_id, invoice_item_id, notes, occurred_at, created_by
      ) VALUES (
        item_row.product_id, item_row.description_snapshot, item_row.unit,
        'SALE_OUT', -item_row.quantity, balance_row.quantity, item_row.invoice_customer_id,
        NEW.id, item_row.id, COALESCE(NEW.invoice_number, 'Invoice'), NEW.issue_date, auth.uid()
      );
    END LOOP;

    INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
    VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', NEW.id, 'STOCK_SALE_OUT',
      jsonb_build_object('invoice_number', NEW.invoice_number));
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE invoice_id = NEW.id AND movement_type = 'INVOICE_VOID_RETURN'
    ) THEN
      RETURN NEW;
    END IF;

    PERFORM sb.product_id
    FROM public.stock_balances sb
    JOIN (
      SELECT DISTINCT product_id FROM public.stock_movements
      WHERE invoice_id = NEW.id AND movement_type = 'SALE_OUT'
    ) products ON products.product_id = sb.product_id
    ORDER BY sb.product_id
    FOR UPDATE;

    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    FOR item_row IN
      SELECT sm.*, p.name AS current_product_name
      FROM public.stock_movements sm
      JOIN public.products p ON p.id = sm.product_id
      WHERE sm.invoice_id = NEW.id AND sm.movement_type = 'SALE_OUT'
      ORDER BY sm.product_id, sm.id
    LOOP
      UPDATE public.stock_balances
      SET quantity = quantity + ABS(item_row.quantity_delta), updated_at = NOW()
      WHERE product_id = item_row.product_id
      RETURNING * INTO balance_row;

      INSERT INTO public.stock_movements(
        product_id, product_name_snapshot, unit, movement_type, quantity_delta,
        balance_after, customer_id, invoice_id, invoice_item_id, notes, occurred_at, created_by
      ) VALUES (
        item_row.product_id, item_row.product_name_snapshot, item_row.unit,
        'INVOICE_VOID_RETURN', ABS(item_row.quantity_delta), balance_row.quantity,
        item_row.customer_id, NEW.id, item_row.invoice_item_id, 'Pengembalian invoice dibatalkan', NOW(), auth.uid()
      );
    END LOOP;

    INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
    VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', NEW.id, 'STOCK_VOID_RETURN',
      jsonb_build_object('invoice_number', NEW.invoice_number));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_invoice_stock_change ON public.invoices;
CREATE CONSTRAINT TRIGGER trg_apply_invoice_stock_change
AFTER INSERT OR UPDATE OF status ON public.invoices
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.apply_invoice_stock_change();

CREATE OR REPLACE FUNCTION public.create_stock_receipt_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  actor_name TEXT;
  supplier_row public.suppliers%ROWTYPE;
  product_row public.products%ROWTYPE;
  item JSONB;
  receipt_id UUID := gen_random_uuid();
  receipt_item_id UUID;
  supplier_bill_id UUID;
  bill_result JSONB;
  receipt_number TEXT;
  period_key TEXT;
  sequence_value INTEGER;
  received_date_value DATE := COALESCE(NULLIF(p_payload->>'receivedDate', '')::DATE, CURRENT_DATE);
  due_date_value DATE := NULLIF(p_payload->>'dueDate', '')::DATE;
  total_value NUMERIC := 0;
  quantity_value NUMERIC;
  unit_cost_value NUMERIC;
  subtotal_value NUMERIC;
  balance_row public.stock_balances%ROWTYPE;
BEGIN
  IF actor_role NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mencatat penerimaan stok';
  END IF;
  IF jsonb_array_length(COALESCE(p_payload->'items', '[]')) = 0 THEN
    RAISE EXCEPTION 'Penerimaan stok harus memiliki minimal satu produk';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_payload->'items', '[]')) item
    GROUP BY item->>'productId' HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Produk yang sama cukup dicatat satu kali dalam satu penerimaan';
  END IF;

  SELECT * INTO supplier_row FROM public.suppliers
  WHERE id = (p_payload->>'supplierId')::UUID AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier aktif tidak ditemukan'; END IF;
  IF due_date_value IS NOT NULL AND due_date_value < received_date_value THEN
    RAISE EXCEPTION 'Jatuh tempo tidak boleh sebelum tanggal penerimaan';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
    quantity_value := ROUND(COALESCE((item->>'quantity')::NUMERIC, 0), 3);
    unit_cost_value := ROUND(COALESCE((item->>'unitCost')::NUMERIC, 0), 2);
    IF quantity_value <= 0 OR unit_cost_value <= 0 THEN
      RAISE EXCEPTION 'Jumlah dan harga beli penerimaan harus lebih dari nol';
    END IF;
    SELECT * INTO product_row FROM public.products
    WHERE id = (item->>'productId')::UUID AND status = 'ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk aktif tidak ditemukan'; END IF;
    total_value := total_value + ROUND(quantity_value * unit_cost_value, 2);
  END LOOP;

  period_key := TO_CHAR(received_date_value, 'YYYY/MM');
  INSERT INTO public.stock_receipt_number_sequences(period_key, last_value)
  VALUES (period_key, 1)
  ON CONFLICT (period_key) DO UPDATE
    SET last_value = public.stock_receipt_number_sequences.last_value + 1,
        updated_at = NOW()
  RETURNING last_value INTO sequence_value;
  receipt_number := 'RCV/' || period_key || '/' || LPAD(sequence_value::TEXT, 4, '0');

  IF COALESCE((p_payload->>'createPayable')::BOOLEAN, FALSE) THEN
    bill_result := public.create_supplier_bill_transaction(jsonb_build_object(
      'supplierId', supplier_row.id,
      'supplierReference', p_payload->>'supplierReference',
      'billDate', received_date_value,
      'dueDate', p_payload->>'dueDate',
      'total', total_value,
      'notes', p_payload->>'notes'
    ));
    supplier_bill_id := (bill_result->>'supplierBillId')::UUID;
  END IF;

  INSERT INTO public.stock_receipts(
    id, receipt_number, supplier_id, supplier_bill_id, supplier_reference,
    received_date, total_cost, notes, created_by
  ) VALUES (
    receipt_id, receipt_number, supplier_row.id, supplier_bill_id,
    NULLIF(BTRIM(p_payload->>'supplierReference'), ''), received_date_value,
    total_value, NULLIF(BTRIM(p_payload->>'notes'), ''), auth.uid()
  );

  INSERT INTO public.stock_balances(product_id)
  SELECT DISTINCT (value->>'productId')::UUID
  FROM jsonb_array_elements(p_payload->'items')
  ON CONFLICT (product_id) DO NOTHING;
  PERFORM sb.product_id
  FROM public.stock_balances sb
  JOIN (
    SELECT DISTINCT (value->>'productId')::UUID AS product_id
    FROM jsonb_array_elements(p_payload->'items')
  ) products ON products.product_id = sb.product_id
  ORDER BY sb.product_id
  FOR UPDATE;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'items') ORDER BY value->>'productId' LOOP
    quantity_value := ROUND((item->>'quantity')::NUMERIC, 3);
    unit_cost_value := ROUND((item->>'unitCost')::NUMERIC, 2);
    subtotal_value := ROUND(quantity_value * unit_cost_value, 2);
    SELECT * INTO product_row FROM public.products WHERE id = (item->>'productId')::UUID;
    UPDATE public.stock_balances
    SET quantity = quantity + quantity_value, updated_at = NOW()
    WHERE product_id = product_row.id
    RETURNING * INTO balance_row;

    receipt_item_id := gen_random_uuid();
    INSERT INTO public.stock_receipt_items(
      id, receipt_id, product_id, product_name_snapshot, unit, quantity, unit_cost, subtotal
    ) VALUES (
      receipt_item_id, receipt_id, product_row.id,
      product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      product_row.default_unit, quantity_value, unit_cost_value, subtotal_value
    );
    INSERT INTO public.stock_movements(
      product_id, product_name_snapshot, unit, movement_type, quantity_delta,
      balance_after, supplier_id, receipt_id, receipt_item_id, notes, occurred_at, created_by
    ) VALUES (
      product_row.id, product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
      product_row.default_unit, 'PURCHASE_IN', quantity_value, balance_row.quantity,
      supplier_row.id, receipt_id, receipt_item_id, receipt_number, received_date_value, auth.uid()
    );
    PERFORM public.set_product_cost(product_row.id, supplier_row.id, unit_cost_value, NOW(), 'HPP dari ' || receipt_number);
  END LOOP;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'stock_receipts', receipt_id, 'STOCK_RECEIPT_CREATED',
    jsonb_build_object('receipt_number', receipt_number, 'supplier_id', supplier_row.id, 'total', total_value, 'supplier_bill_id', supplier_bill_id));
  RETURN jsonb_build_object('receiptId', receipt_id, 'receiptNumber', receipt_number, 'supplierBillId', supplier_bill_id, 'total', total_value);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_stock_transaction(
  p_product_id UUID, p_quantity_delta NUMERIC, p_notes TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  balance_row public.stock_balances%ROWTYPE;
  new_quantity NUMERIC;
  movement_type_value public.stock_movement_type;
  actor_name TEXT;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat menyesuaikan stok';
  END IF;
  IF p_quantity_delta IS NULL OR p_quantity_delta = 0 THEN RAISE EXCEPTION 'Perubahan stok tidak boleh nol'; END IF;
  IF NULLIF(BTRIM(p_notes), '') IS NULL THEN RAISE EXCEPTION 'Alasan penyesuaian stok wajib diisi'; END IF;
  SELECT * INTO product_row FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
  INSERT INTO public.stock_balances(product_id) VALUES (p_product_id) ON CONFLICT (product_id) DO NOTHING;
  SELECT * INTO balance_row FROM public.stock_balances WHERE product_id = p_product_id FOR UPDATE;
  new_quantity := balance_row.quantity + p_quantity_delta;
  IF new_quantity < 0 THEN RAISE EXCEPTION 'Stok tidak cukup untuk penyesuaian'; END IF;
  movement_type_value := CASE WHEN p_quantity_delta > 0 THEN 'ADJUSTMENT_IN' ELSE 'ADJUSTMENT_OUT' END;
  UPDATE public.stock_balances SET quantity = new_quantity, updated_at = NOW() WHERE product_id = p_product_id;
  INSERT INTO public.stock_movements(
    product_id, product_name_snapshot, unit, movement_type, quantity_delta,
    balance_after, notes, occurred_at, created_by
  ) VALUES (
    p_product_id, product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
    product_row.default_unit, movement_type_value, p_quantity_delta, new_quantity, BTRIM(p_notes), NOW(), auth.uid()
  );
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'stock_balances', p_product_id, 'STOCK_ADJUSTED',
    jsonb_build_object('quantity_delta', p_quantity_delta, 'balance_after', new_quantity, 'notes', BTRIM(p_notes)));
  RETURN new_quantity;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_stock_minimum(p_product_id UUID, p_minimum_quantity NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_minimum NUMERIC := ROUND(COALESCE(p_minimum_quantity, 0), 3);
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat mengatur stok minimum';
  END IF;
  IF new_minimum < 0 THEN RAISE EXCEPTION 'Stok minimum tidak boleh negatif'; END IF;
  INSERT INTO public.stock_balances(product_id) VALUES (p_product_id) ON CONFLICT (product_id) DO NOTHING;
  UPDATE public.stock_balances SET minimum_quantity = new_minimum, updated_at = NOW() WHERE product_id = p_product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;
  RETURN new_minimum;
END;
$$;

ALTER TABLE public.stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS approved_stock_balances_read ON public.stock_balances;
DROP POLICY IF EXISTS finance_stock_receipts_read ON public.stock_receipts;
DROP POLICY IF EXISTS finance_stock_receipt_items_read ON public.stock_receipt_items;
DROP POLICY IF EXISTS finance_stock_movements_read ON public.stock_movements;
CREATE POLICY approved_stock_balances_read ON public.stock_balances FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY finance_stock_receipts_read ON public.stock_receipts FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));
CREATE POLICY finance_stock_receipt_items_read ON public.stock_receipt_items FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));
CREATE POLICY finance_stock_movements_read ON public.stock_movements FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));

REVOKE ALL ON TABLE public.stock_balances, public.stock_receipts, public.stock_receipt_items, public.stock_movements FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.stock_balances, public.stock_receipts, public.stock_receipt_items, public.stock_movements FROM authenticated;
GRANT SELECT ON TABLE public.stock_balances, public.stock_receipts, public.stock_receipt_items, public.stock_movements TO authenticated;
REVOKE ALL ON FUNCTION public.create_stock_receipt_transaction(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_stock_transaction(UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_stock_minimum(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_stock_receipt_transaction(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock_transaction(UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_minimum(UUID, NUMERIC) TO authenticated;
REVOKE ALL ON FUNCTION public.initialize_product_stock_balance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_invoice_stock_change() FROM PUBLIC, anon, authenticated;
