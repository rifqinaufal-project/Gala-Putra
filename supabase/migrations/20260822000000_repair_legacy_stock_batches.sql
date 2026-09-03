-- Repair legacy products whose stock balance predates the batch ledger.
-- The first batch migration only filled products with zero receipt batches;
-- products with a mixture of legacy stock and newer receipt batches could
-- still have less open batch quantity than their real stock balance.
INSERT INTO public.stock_batches(
  product_id,
  supplier_id,
  quantity_received,
  quantity_remaining,
  unit_cost,
  received_at,
  notes
)
SELECT
  balance.product_id,
  NULL,
  ROUND(balance.quantity - open_batches.quantity_remaining, 3),
  ROUND(balance.quantity - open_batches.quantity_remaining, 3),
  ROUND(COALESCE(balance.average_unit_cost, 0), 2),
  COALESCE(balance.updated_at, NOW()),
  'Batch migrasi koreksi saldo lama; supplier dan tanggal pembelian tidak tersedia'
FROM public.stock_balances AS balance
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(batch.quantity_remaining), 0) AS quantity_remaining
  FROM public.stock_batches AS batch
  WHERE batch.product_id = balance.product_id
    AND batch.status = 'OPEN'
    AND batch.quantity_remaining > 0
) AS open_batches
WHERE balance.quantity > open_batches.quantity_remaining + 0.0005;

-- Make the repair self-healing for legacy data inserted after this migration.
-- Invoice stock validation already guarantees that the post-sale balance cannot
-- be negative, so a missing batch can safely be represented by an unattributed
-- legacy batch at the current average HPP.
CREATE OR REPLACE FUNCTION public.apply_stock_movement_to_batches()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_value NUMERIC := ABS(NEW.quantity_delta);
  batch_row RECORD;
  allocated_value NUMERIC;
  balance_quantity_value NUMERIC;
  open_batch_quantity_value NUMERIC;
  legacy_gap_value NUMERIC;
  legacy_cost_value NUMERIC;
BEGIN
  IF NEW.movement_type = 'INVOICE_VOID_RETURN'::public.stock_movement_type THEN
    FOR batch_row IN
      SELECT allocation.batch_id, allocation.quantity
      FROM public.stock_batch_allocations AS allocation
      JOIN public.stock_movements AS sale
        ON sale.id = allocation.movement_id
      WHERE sale.invoice_item_id = NEW.invoice_item_id
        AND sale.movement_type = 'SALE_OUT'::public.stock_movement_type
    LOOP
      UPDATE public.stock_batches AS batch
      SET quantity_remaining = batch.quantity_remaining + batch_row.quantity,
          status = 'OPEN'
      WHERE batch.id = batch_row.batch_id;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NEW.movement_type = 'ADJUSTMENT_IN'::public.stock_movement_type
    AND NEW.receipt_item_id IS NULL THEN
    INSERT INTO public.stock_batches(
      product_id, quantity_received, quantity_remaining, unit_cost,
      received_at, notes
    )
    SELECT balance.product_id, NEW.quantity_delta, NEW.quantity_delta,
      balance.average_unit_cost, NEW.occurred_at,
      'Batch penyesuaian: ' || COALESCE(NEW.notes, 'tanpa catatan')
    FROM public.stock_balances AS balance
    WHERE balance.product_id = NEW.product_id;
    RETURN NEW;
  END IF;

  IF NEW.movement_type = 'ADJUSTMENT_OUT'::public.stock_movement_type
    AND NEW.receipt_item_id IS NOT NULL THEN
    UPDATE public.stock_batches AS batch
    SET quantity_remaining = 0,
        status = 'CANCELLED'
    WHERE batch.receipt_item_id = NEW.receipt_item_id;
    RETURN NEW;
  END IF;

  IF NEW.movement_type NOT IN (
    'SALE_OUT'::public.stock_movement_type,
    'ADJUSTMENT_OUT'::public.stock_movement_type
  ) THEN
    RETURN NEW;
  END IF;

  SELECT balance.quantity, balance.average_unit_cost
  INTO balance_quantity_value, legacy_cost_value
  FROM public.stock_balances AS balance
  WHERE balance.product_id = NEW.product_id
  FOR UPDATE;

  SELECT COALESCE(SUM(batch.quantity_remaining), 0)
  INTO open_batch_quantity_value
  FROM public.stock_batches AS batch
  WHERE batch.product_id = NEW.product_id
    AND batch.status = 'OPEN'
    AND batch.quantity_remaining > 0;

  -- Add only the quantity that existed before this movement but has no batch
  -- representation. This preserves all existing FIFO allocations and avoids
  -- inventing stock when the balance itself is insufficient.
  legacy_gap_value := ROUND(
    GREATEST(
      0,
      (COALESCE(balance_quantity_value, 0) + remaining_value)
      - COALESCE(open_batch_quantity_value, 0)
    ),
    3
  );
  IF legacy_gap_value > 0 THEN
    INSERT INTO public.stock_batches(
      product_id, quantity_received, quantity_remaining, unit_cost,
      received_at, notes
    ) VALUES (
      NEW.product_id,
      legacy_gap_value,
      legacy_gap_value,
      ROUND(COALESCE(legacy_cost_value, 0), 2),
      NEW.occurred_at,
      'Batch migrasi otomatis dari saldo lama'
    );
  END IF;

  FOR batch_row IN
    SELECT batch.id, batch.quantity_remaining
    FROM public.stock_batches AS batch
    WHERE batch.product_id = NEW.product_id
      AND batch.status = 'OPEN'
      AND batch.quantity_remaining > 0
    ORDER BY batch.expiry_date NULLS LAST, batch.received_at,
      batch.created_at, batch.id
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_value <= 0;
    allocated_value := LEAST(remaining_value, batch_row.quantity_remaining);
    UPDATE public.stock_batches AS batch
    SET quantity_remaining = batch.quantity_remaining - allocated_value,
        status = CASE
          WHEN batch.quantity_remaining - allocated_value = 0 THEN 'DEPLETED'
          ELSE 'OPEN'
        END
    WHERE batch.id = batch_row.id;
    INSERT INTO public.stock_batch_allocations(batch_id, movement_id, quantity)
    VALUES (batch_row.id, NEW.id, allocated_value);
    remaining_value := remaining_value - allocated_value;
  END LOOP;

  IF remaining_value > 0 THEN
    RAISE EXCEPTION 'Batch stok untuk % tidak cukup. Saldo batch belum sesuai dengan stok tercatat.', NEW.product_name_snapshot;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stock_movement_to_batches() FROM PUBLIC, anon, authenticated;
