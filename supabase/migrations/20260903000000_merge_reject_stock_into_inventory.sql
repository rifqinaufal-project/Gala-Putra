-- Factory rejects are also available as normal product stock.
-- The legacy reject ledger remains for reconciliation history, while the
-- product stock ledger becomes the source used by normal invoices.

CREATE OR REPLACE FUNCTION public.sync_reject_stock_to_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta_quantity NUMERIC;
  balance_row public.stock_balances%ROWTYPE;
  product_row public.products%ROWTYPE;
  next_quantity NUMERIC;
  next_average_cost NUMERIC;
  movement_type_value public.stock_movement_type;
BEGIN
  delta_quantity := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.quantity_kg
    ELSE NEW.quantity_kg - OLD.quantity_kg
  END;

  IF delta_quantity = 0 THEN RETURN NEW; END IF;

  SELECT * INTO product_row FROM public.products WHERE id = NEW.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk reject tidak ditemukan'; END IF;

  INSERT INTO public.stock_balances(product_id)
  VALUES (NEW.product_id)
  ON CONFLICT (product_id) DO NOTHING;

  SELECT * INTO balance_row
  FROM public.stock_balances
  WHERE product_id = NEW.product_id
  FOR UPDATE;

  next_quantity := balance_row.quantity + delta_quantity;
  IF next_quantity < 0 THEN RAISE EXCEPTION 'Stok produk tidak cukup untuk perubahan stok reject'; END IF;

  next_average_cost := CASE
    WHEN delta_quantity > 0 AND next_quantity > 0 THEN
      ROUND(((balance_row.quantity * balance_row.average_unit_cost)
        + (delta_quantity * NEW.average_unit_cost)) / next_quantity, 2)
    ELSE balance_row.average_unit_cost
  END;

  UPDATE public.stock_balances
  SET quantity = next_quantity, average_unit_cost = next_average_cost, updated_at = NOW()
  WHERE product_id = NEW.product_id;

  movement_type_value := CASE
    WHEN delta_quantity > 0 THEN 'ADJUSTMENT_IN'::public.stock_movement_type
    ELSE 'ADJUSTMENT_OUT'::public.stock_movement_type
  END;

  INSERT INTO public.stock_movements(
    product_id, product_name_snapshot, unit, movement_type, quantity_delta,
    balance_after, notes, occurred_at, created_by
  ) VALUES (
    NEW.product_id,
    product_row.name || CASE WHEN product_row.size IS NOT NULL THEN ' [' || product_row.size || ']' ELSE '' END,
    'kg', movement_type_value, delta_quantity, next_quantity,
    'Reject pabrik masuk ke stok produk', NOW(), auth.uid()
  );

  -- ADJUSTMENT_IN creates a FIFO batch through the existing inventory trigger.
  -- Replace its default weighted-average cost with the reject lot cost.
  IF delta_quantity > 0 THEN
    UPDATE public.stock_batches
    SET unit_cost = NEW.average_unit_cost,
        notes = 'Batch dari reject pabrik'
    WHERE id = (
      SELECT id FROM public.stock_batches
      WHERE product_id = NEW.product_id
        AND notes = 'Batch penyesuaian: Reject pabrik masuk ke stok produk'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reject_stock_to_inventory ON public.reject_stock_balances;
CREATE TRIGGER trg_sync_reject_stock_to_inventory
AFTER INSERT OR UPDATE OF quantity_kg ON public.reject_stock_balances
FOR EACH ROW EXECUTE FUNCTION public.sync_reject_stock_to_inventory();

-- Backfill existing reject balances into the normal product inventory.
INSERT INTO public.stock_balances(product_id, quantity, average_unit_cost, updated_at)
SELECT product_id, quantity_kg, average_unit_cost, NOW()
FROM public.reject_stock_balances
WHERE quantity_kg > 0
ON CONFLICT (product_id) DO UPDATE SET
  average_unit_cost = CASE
    WHEN public.stock_balances.quantity + EXCLUDED.quantity > 0 THEN
      ROUND(((public.stock_balances.quantity * public.stock_balances.average_unit_cost)
        + (EXCLUDED.quantity * EXCLUDED.average_unit_cost))
        / (public.stock_balances.quantity + EXCLUDED.quantity), 2)
    ELSE public.stock_balances.average_unit_cost
  END,
  quantity = public.stock_balances.quantity + EXCLUDED.quantity,
  updated_at = NOW();

INSERT INTO public.stock_movements(
  product_id, product_name_snapshot, unit, movement_type, quantity_delta,
  balance_after, notes, occurred_at
)
SELECT reject.product_id,
  product.name || CASE WHEN product.size IS NOT NULL THEN ' [' || product.size || ']' ELSE '' END,
  'kg', 'ADJUSTMENT_IN'::public.stock_movement_type, reject.quantity_kg,
  balance.quantity, 'Migrasi stok reject ke stok produk', NOW()
FROM public.reject_stock_balances reject
JOIN public.products product ON product.id = reject.product_id
JOIN public.stock_balances balance ON balance.product_id = reject.product_id
WHERE reject.quantity_kg > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.stock_movements movement
    WHERE movement.product_id = reject.product_id
      AND movement.notes = 'Migrasi stok reject ke stok produk'
  );

-- The stock movement above creates the matching FIFO batch automatically.
UPDATE public.stock_batches batch
SET unit_cost = reject.average_unit_cost,
    notes = 'Batch migrasi reject ke stok produk'
FROM public.reject_stock_balances reject
WHERE batch.product_id = reject.product_id
  AND batch.notes = 'Batch penyesuaian: Migrasi stok reject ke stok produk';

REVOKE ALL ON FUNCTION public.create_reject_stock_sale_transaction(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_reject_stock_to_inventory() FROM PUBLIC, anon, authenticated;
