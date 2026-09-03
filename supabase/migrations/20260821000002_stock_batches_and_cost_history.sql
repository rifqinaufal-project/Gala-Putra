-- Additive inventory audit layer. Existing receipt and movement rows remain intact.
CREATE TABLE IF NOT EXISTS public.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  receipt_item_id UUID UNIQUE REFERENCES public.stock_receipt_items(id) ON DELETE RESTRICT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  quantity_received NUMERIC(14, 3) NOT NULL CHECK (quantity_received > 0),
  quantity_remaining NUMERIC(14, 3) NOT NULL CHECK (quantity_remaining >= 0),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'DEPLETED', 'CANCELLED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_batch_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.stock_batches(id) ON DELETE RESTRICT,
  movement_id UUID NOT NULL REFERENCES public.stock_movements(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(batch_id, movement_id)
);

CREATE TABLE IF NOT EXISTS public.product_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  old_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  new_cost NUMERIC(14, 2) NOT NULL CHECK (new_cost >= 0),
  source_type TEXT NOT NULL,
  source_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_batches_product_fifo
  ON public.stock_batches(product_id, received_at, created_at)
  WHERE status = 'OPEN' AND quantity_remaining > 0;
CREATE INDEX IF NOT EXISTS idx_batch_allocations_movement ON public.stock_batch_allocations(movement_id);
CREATE INDEX IF NOT EXISTS idx_product_cost_history_product ON public.product_cost_history(product_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.create_stock_batch_for_receipt_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE supplier_value UUID; received_value TIMESTAMPTZ;
BEGIN
  SELECT supplier_id, received_date::timestamptz INTO supplier_value, received_value
  FROM public.stock_receipts WHERE id = NEW.receipt_id;
  INSERT INTO public.stock_batches(product_id, receipt_item_id, supplier_id, quantity_received,
    quantity_remaining, unit_cost, received_at, notes)
  VALUES (NEW.product_id, NEW.id, supplier_value, NEW.quantity, NEW.quantity,
    NEW.unit_cost, COALESCE(received_value, NOW()), 'Batch dibuat dari penerimaan ' || NEW.receipt_id)
  ON CONFLICT (receipt_item_id) DO NOTHING;

  INSERT INTO public.product_cost_history(product_id, old_cost, new_cost, source_type, source_id, created_by)
  SELECT NEW.product_id, COALESCE((
    SELECT new_cost FROM public.product_cost_history
    WHERE product_id = NEW.product_id ORDER BY created_at DESC LIMIT 1
  ), 0), balance.average_unit_cost, 'PURCHASE_RECEIPT', NEW.receipt_id, receipt.created_by
  FROM public.stock_balances balance
  JOIN public.stock_receipts receipt ON receipt.id = NEW.receipt_id
  WHERE balance.product_id = NEW.product_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_create_stock_batch_for_receipt_item ON public.stock_receipt_items;
CREATE TRIGGER trg_create_stock_batch_for_receipt_item
AFTER INSERT ON public.stock_receipt_items FOR EACH ROW
EXECUTE FUNCTION public.create_stock_batch_for_receipt_item();

-- Backfill only products with no receipt-based batch. This preserves the old balance
-- and makes the assumption explicit for later FIFO reporting.
INSERT INTO public.stock_batches(product_id, supplier_id, quantity_received, quantity_remaining,
  unit_cost, received_at, notes)
SELECT sb.product_id, NULL, sb.quantity, sb.quantity, sb.average_unit_cost, NOW(),
  'Batch migrasi saldo lama; supplier dan tanggal pembelian tidak tersedia'
FROM public.stock_balances sb
WHERE sb.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM public.stock_batches b WHERE b.product_id = sb.product_id);

INSERT INTO public.product_cost_history(product_id, old_cost, new_cost, source_type, created_at)
SELECT product_id, 0, average_unit_cost, 'LEGACY_MIGRATION', NOW()
FROM public.stock_balances
WHERE average_unit_cost > 0
  AND NOT EXISTS (SELECT 1 FROM public.product_cost_history h WHERE h.product_id = stock_balances.product_id);

ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_batch_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_cost_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_stock_batches_read ON public.stock_batches;
DROP POLICY IF EXISTS finance_batch_allocations_read ON public.stock_batch_allocations;
DROP POLICY IF EXISTS finance_cost_history_read ON public.product_cost_history;
CREATE POLICY finance_stock_batches_read ON public.stock_batches FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));
CREATE POLICY finance_batch_allocations_read ON public.stock_batch_allocations FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));
CREATE POLICY finance_cost_history_read ON public.product_cost_history FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role));
REVOKE INSERT, UPDATE, DELETE ON public.stock_batches, public.stock_batch_allocations, public.product_cost_history FROM authenticated;

-- Allocate new sales to the earliest eligible open batch. When expiry dates are
-- later populated, the order becomes FEFO; otherwise it remains FIFO.
CREATE OR REPLACE FUNCTION public.apply_stock_movement_to_batches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining_value NUMERIC := ABS(NEW.quantity_delta); batch_row RECORD; allocated_value NUMERIC;
BEGIN
  IF NEW.movement_type = 'INVOICE_VOID_RETURN'::public.stock_movement_type THEN
    FOR batch_row IN
      SELECT allocation.batch_id, allocation.quantity
      FROM public.stock_batch_allocations allocation
      JOIN public.stock_movements sale ON sale.id = allocation.movement_id
      WHERE sale.invoice_item_id = NEW.invoice_item_id
        AND sale.movement_type = 'SALE_OUT'::public.stock_movement_type
    LOOP
      UPDATE public.stock_batches
      SET quantity_remaining = quantity_remaining + batch_row.quantity,
          status = 'OPEN'
      WHERE id = batch_row.batch_id;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.movement_type = 'ADJUSTMENT_IN'::public.stock_movement_type AND NEW.receipt_item_id IS NULL THEN
    INSERT INTO public.stock_batches(product_id, quantity_received, quantity_remaining, unit_cost,
      received_at, notes)
    SELECT NEW.product_id, NEW.quantity_delta, NEW.quantity_delta, average_unit_cost, NEW.occurred_at,
      'Batch penyesuaian: ' || COALESCE(NEW.notes, 'tanpa catatan')
    FROM public.stock_balances WHERE product_id = NEW.product_id;
    RETURN NEW;
  END IF;

  IF NEW.movement_type = 'ADJUSTMENT_OUT'::public.stock_movement_type AND NEW.receipt_item_id IS NOT NULL THEN
    UPDATE public.stock_batches SET quantity_remaining = 0, status = 'CANCELLED'
    WHERE receipt_item_id = NEW.receipt_item_id;
    RETURN NEW;
  END IF;

  IF NEW.movement_type NOT IN ('SALE_OUT'::public.stock_movement_type, 'ADJUSTMENT_OUT'::public.stock_movement_type) THEN RETURN NEW; END IF;
  FOR batch_row IN
    SELECT id, quantity_remaining FROM public.stock_batches
    WHERE product_id = NEW.product_id AND status = 'OPEN' AND quantity_remaining > 0
    ORDER BY expiry_date NULLS LAST, received_at, created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_value <= 0;
    allocated_value := LEAST(remaining_value, batch_row.quantity_remaining);
    UPDATE public.stock_batches
    SET quantity_remaining = quantity_remaining - allocated_value,
        status = CASE WHEN quantity_remaining - allocated_value = 0 THEN 'DEPLETED' ELSE 'OPEN' END
    WHERE id = batch_row.id;
    INSERT INTO public.stock_batch_allocations(batch_id, movement_id, quantity)
    VALUES (batch_row.id, NEW.id, allocated_value);
    remaining_value := remaining_value - allocated_value;
  END LOOP;
  IF remaining_value > 0 THEN
    RAISE EXCEPTION 'Batch stok untuk % tidak cukup. Jalankan migrasi batch sebelum menerbitkan invoice.', NEW.product_name_snapshot;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_apply_stock_movement_to_batches ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement_to_batches
AFTER INSERT ON public.stock_movements FOR EACH ROW
EXECUTE FUNCTION public.apply_stock_movement_to_batches();

REVOKE ALL ON FUNCTION public.create_stock_batch_for_receipt_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stock_movement_to_batches() FROM PUBLIC, anon, authenticated;
