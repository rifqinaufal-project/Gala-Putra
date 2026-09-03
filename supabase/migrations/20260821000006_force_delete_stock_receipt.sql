-- Destructive purchase cleanup for Owner. Invoice snapshots remain untouched.
-- The operation removes the entire receipt, including all products on it.
CREATE OR REPLACE FUNCTION public.force_delete_stock_receipt(p_receipt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_row public.stock_receipts%ROWTYPE;
  item_row RECORD;
  actor_name TEXT;
  product_ids UUID[];
  remaining_quantity NUMERIC;
  remaining_value NUMERIC;
  remaining_average NUMERIC;
  deleted_items INTEGER := 0;
  deleted_movements INTEGER := 0;
  deleted_batches INTEGER := 0;
BEGIN
  IF public.current_user_role() <> 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus pembelian secara permanen';
  END IF;

  SELECT * INTO receipt_row
  FROM public.stock_receipts
  WHERE id = p_receipt_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penerimaan stok tidak ditemukan'; END IF;

  -- Lock affected product balances before deleting receipt consequences.
  PERFORM balance.product_id
  FROM public.stock_balances AS balance
  WHERE EXISTS (
    SELECT 1 FROM public.stock_receipt_items AS item
    WHERE item.receipt_id = p_receipt_id AND item.product_id = balance.product_id
  )
  ORDER BY balance.product_id
  FOR UPDATE;

  SELECT ARRAY_AGG(DISTINCT product_id)
  INTO product_ids
  FROM public.stock_receipt_items
  WHERE receipt_id = p_receipt_id;

  -- Remove FIFO/FEFO allocations and batches created by this receipt.
  DELETE FROM public.stock_batch_allocations AS allocation
  USING public.stock_batches AS batch, public.stock_receipt_items AS item
  WHERE allocation.batch_id = batch.id
    AND batch.receipt_item_id = item.id
    AND item.receipt_id = p_receipt_id;

  DELETE FROM public.stock_batches AS batch
  USING public.stock_receipt_items AS item
  WHERE batch.receipt_item_id = item.id
    AND item.receipt_id = p_receipt_id;
  GET DIAGNOSTICS deleted_batches = ROW_COUNT;

  -- Delete purchase movements and any receipt reversal movements. Sales remain
  -- in invoice history, while current stock is rebuilt from remaining batches.
  DELETE FROM public.stock_movements
  WHERE receipt_id = p_receipt_id;
  GET DIAGNOSTICS deleted_movements = ROW_COUNT;

  DELETE FROM public.stock_receipt_items
  WHERE receipt_id = p_receipt_id;
  GET DIAGNOSTICS deleted_items = ROW_COUNT;

  -- Rebuild each affected balance from the remaining batch ledger. This avoids
  -- leaving a stale quantity/HPP after a destructive receipt deletion.
  FOR item_row IN
    SELECT product_id
    FROM UNNEST(COALESCE(product_ids, ARRAY[]::UUID[])) AS affected(product_id)
  LOOP
    SELECT COALESCE(SUM(batch.quantity_remaining), 0),
           COALESCE(SUM(batch.quantity_remaining * batch.unit_cost), 0)
    INTO remaining_quantity, remaining_value
    FROM public.stock_batches AS batch
    WHERE batch.product_id = item_row.product_id
      AND batch.quantity_remaining > 0
      AND batch.status = 'OPEN';

    remaining_average := CASE
      WHEN remaining_quantity > 0 THEN ROUND(remaining_value / remaining_quantity, 2)
      ELSE 0
    END;

    UPDATE public.stock_balances
    SET quantity = remaining_quantity,
        average_unit_cost = remaining_average,
        updated_at = NOW()
    WHERE product_id = item_row.product_id;
  END LOOP;

  IF receipt_row.supplier_bill_id IS NOT NULL THEN
    DELETE FROM public.supplier_payments
    WHERE supplier_bill_id = receipt_row.supplier_bill_id;
  END IF;

  SELECT full_name INTO actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'stock_receipts', p_receipt_id,
    'STOCK_RECEIPT_FORCE_DELETED',
    jsonb_build_object(
      'receipt_number', receipt_row.receipt_number,
      'supplier_id', receipt_row.supplier_id,
      'deleted_items', deleted_items,
      'deleted_movements', deleted_movements,
      'deleted_batches', deleted_batches,
      'invoice_history_preserved', TRUE,
      'receipt_cancellation_bypassed', TRUE
    )
  );

  DELETE FROM public.stock_receipts WHERE id = p_receipt_id;

  IF receipt_row.supplier_bill_id IS NOT NULL THEN
    DELETE FROM public.supplier_bills
    WHERE id = receipt_row.supplier_bill_id;
  END IF;
  RETURN jsonb_build_object(
    'receiptNumber', receipt_row.receipt_number,
    'invoiceHistoryPreserved', TRUE,
    'deletedItems', deleted_items,
    'deletedMovements', deleted_movements,
    'deletedBatches', deleted_batches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_stock_receipt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_delete_stock_receipt(UUID) TO authenticated;
