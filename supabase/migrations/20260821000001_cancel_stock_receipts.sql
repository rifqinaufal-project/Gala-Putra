-- A receipt is never physically deleted. Cancellation keeps its purchase
-- evidence, reverses its stock effect, and leaves an audit trail.
ALTER TABLE public.stock_receipts
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_receipts_cancelled_at
  ON public.stock_receipts(cancelled_at)
  WHERE cancelled_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cancel_stock_receipt_transaction(
  p_receipt_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_row public.stock_receipts%ROWTYPE;
  bill_row public.supplier_bills%ROWTYPE;
  receipt_item_row public.stock_receipt_items%ROWTYPE;
  purchase_movement_row public.stock_movements%ROWTYPE;
  balance_row public.stock_balances%ROWTYPE;
  new_quantity_value NUMERIC;
  new_average_cost_value NUMERIC;
  actor_name TEXT;
  supplier_bill_voided BOOLEAN := FALSE;
BEGIN
  IF public.current_user_role() NOT IN ('OWNER'::public.user_role, 'FINANCE'::public.user_role) THEN
    RAISE EXCEPTION 'Hanya Owner/Finance yang dapat membatalkan penerimaan stok';
  END IF;
  IF p_receipt_id IS NULL THEN RAISE EXCEPTION 'Penerimaan stok tidak valid'; END IF;
  IF NULLIF(BTRIM(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Alasan pembatalan wajib diisi'; END IF;

  SELECT receipt.* INTO receipt_row
  FROM public.stock_receipts AS receipt
  WHERE receipt.id = p_receipt_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penerimaan stok tidak ditemukan'; END IF;
  IF receipt_row.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Penerimaan stok ini sudah dibatalkan'; END IF;

  -- Lock all affected balances in a stable order before checking for later
  -- movements, so a concurrent invoice or receipt cannot slip in midway.
  PERFORM balance.product_id
  FROM public.stock_balances AS balance
  JOIN public.stock_receipt_items AS receipt_item ON receipt_item.product_id = balance.product_id
  WHERE receipt_item.receipt_id = receipt_row.id
  ORDER BY balance.product_id
  FOR UPDATE;

  IF receipt_row.supplier_bill_id IS NOT NULL THEN
    SELECT bill.* INTO bill_row
    FROM public.supplier_bills AS bill
    WHERE bill.id = receipt_row.supplier_bill_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan supplier penerimaan tidak ditemukan'; END IF;
    IF bill_row.status <> 'OPEN'::public.supplier_bill_status OR bill_row.total_paid <> 0 THEN
      RAISE EXCEPTION 'Penerimaan tidak dapat dibatalkan karena hutang supplier sudah diproses atau dibayar';
    END IF;
  END IF;

  FOR receipt_item_row IN
    SELECT receipt_item.*
    FROM public.stock_receipt_items AS receipt_item
    WHERE receipt_item.receipt_id = receipt_row.id
    ORDER BY receipt_item.product_id
  LOOP
    SELECT purchase_movement.* INTO purchase_movement_row
    FROM public.stock_movements AS purchase_movement
    WHERE purchase_movement.receipt_item_id = receipt_item_row.id
      AND purchase_movement.movement_type = 'PURCHASE_IN'::public.stock_movement_type;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mutasi pembelian penerimaan tidak ditemukan'; END IF;

    -- Reversing a non-final movement would require recalculating every later
    -- sale/receipt HPP. Reject it rather than corrupt the perpetual average.
    IF EXISTS (
      SELECT 1
      FROM public.stock_movements AS later_movement
      WHERE later_movement.product_id = receipt_item_row.product_id
        AND later_movement.created_at > purchase_movement_row.created_at
    ) THEN
      RAISE EXCEPTION 'Penerimaan % tidak dapat dibatalkan karena produk % sudah memiliki mutasi stok lanjutan', receipt_row.receipt_number, receipt_item_row.product_name_snapshot;
    END IF;

    SELECT balance.* INTO balance_row
    FROM public.stock_balances AS balance
    WHERE balance.product_id = receipt_item_row.product_id;
    IF balance_row.quantity < receipt_item_row.quantity THEN
      RAISE EXCEPTION 'Stok % tidak cukup untuk membatalkan penerimaan', receipt_item_row.product_name_snapshot;
    END IF;

    new_quantity_value := balance_row.quantity - receipt_item_row.quantity;
    new_average_cost_value := CASE
      WHEN new_quantity_value = 0 THEN 0
      ELSE ROUND(
        ((balance_row.quantity * balance_row.average_unit_cost) - (receipt_item_row.quantity * receipt_item_row.unit_cost))
        / new_quantity_value,
        2
      )
    END;
    IF new_average_cost_value < 0 THEN
      RAISE EXCEPTION 'HPP setelah pembatalan tidak valid untuk produk %', receipt_item_row.product_name_snapshot;
    END IF;

    UPDATE public.stock_balances AS balance
    SET quantity = new_quantity_value,
        average_unit_cost = new_average_cost_value,
        updated_at = NOW()
    WHERE balance.product_id = receipt_item_row.product_id;

    INSERT INTO public.stock_movements(
      product_id, product_name_snapshot, unit, movement_type, quantity_delta,
      balance_after, supplier_id, receipt_id, receipt_item_id, notes, occurred_at, created_by
    ) VALUES (
      receipt_item_row.product_id, receipt_item_row.product_name_snapshot, receipt_item_row.unit,
      'ADJUSTMENT_OUT'::public.stock_movement_type, -receipt_item_row.quantity,
      new_quantity_value, receipt_row.supplier_id, receipt_row.id, receipt_item_row.id,
      'Pembatalan penerimaan ' || receipt_row.receipt_number || ': ' || BTRIM(p_reason), NOW(), auth.uid()
    );

    IF new_quantity_value = 0 THEN
      UPDATE public.product_costs AS cost
      SET ended_at = NOW()
      WHERE cost.product_id = receipt_item_row.product_id
        AND cost.ended_at IS NULL;
    ELSE
      PERFORM public.set_product_cost(
        receipt_item_row.product_id,
        receipt_row.supplier_id,
        new_average_cost_value,
        NOW(),
        'HPP setelah pembatalan ' || receipt_row.receipt_number
      );
    END IF;
  END LOOP;

  UPDATE public.stock_receipts AS receipt
  SET cancelled_at = NOW(),
      cancelled_by = auth.uid(),
      cancellation_reason = BTRIM(p_reason)
  WHERE receipt.id = receipt_row.id;

  IF receipt_row.supplier_bill_id IS NOT NULL THEN
    UPDATE public.supplier_bills AS bill
    SET status = 'VOID'::public.supplier_bill_status,
        notes = CONCAT_WS(E'\n', bill.notes, 'Dibatalkan bersama penerimaan ' || receipt_row.receipt_number || ': ' || BTRIM(p_reason)),
        updated_at = NOW()
    WHERE bill.id = receipt_row.supplier_bill_id;
    supplier_bill_voided := TRUE;
  END IF;

  SELECT profile.full_name INTO actor_name
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'User'), 'stock_receipts', receipt_row.id, 'STOCK_RECEIPT_CANCELLED',
    jsonb_build_object(
      'receipt_number', receipt_row.receipt_number,
      'reason', BTRIM(p_reason),
      'supplier_bill_id', receipt_row.supplier_bill_id,
      'supplier_bill_voided', supplier_bill_voided
    )
  );

  RETURN jsonb_build_object(
    'receiptId', receipt_row.id,
    'receiptNumber', receipt_row.receipt_number,
    'supplierBillVoided', supplier_bill_voided
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stock_receipt_transaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_receipt_transaction(UUID, TEXT) TO authenticated;
