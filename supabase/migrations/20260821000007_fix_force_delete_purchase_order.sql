-- Fix FK order for destructive product and receipt deletion.
-- stock_receipts.supplier_bill_id references supplier_bills, so receipt headers
-- must be removed before their supplier bills.

CREATE OR REPLACE FUNCTION public.force_delete_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_row public.products%ROWTYPE;
  actor_name TEXT;
  receipt_ids UUID[];
  supplier_bill_ids UUID[];
  deleted_movements INTEGER := 0;
  deleted_batches INTEGER := 0;
  deleted_receipt_items INTEGER := 0;
  deleted_receipts INTEGER := 0;
BEGIN
  IF public.current_user_role() <> 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus produk secara permanen';
  END IF;

  SELECT * INTO product_row FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  SELECT ARRAY_AGG(DISTINCT receipt_item.receipt_id), ARRAY_AGG(DISTINCT receipt.supplier_bill_id)
  INTO receipt_ids, supplier_bill_ids
  FROM public.stock_receipt_items receipt_item
  JOIN public.stock_receipts receipt ON receipt.id = receipt_item.receipt_id
  WHERE receipt_item.product_id = p_product_id;

  DELETE FROM public.stock_batch_allocations allocation
  USING public.stock_batches batch
  WHERE allocation.batch_id = batch.id AND batch.product_id = p_product_id;
  DELETE FROM public.stock_batches WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_batches = ROW_COUNT;
  DELETE FROM public.product_cost_history WHERE product_id = p_product_id;
  DELETE FROM public.stock_movements WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_movements = ROW_COUNT;
  DELETE FROM public.stock_receipt_items WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_receipt_items = ROW_COUNT;

  -- Remove only receipt headers that became empty. This must happen before
  -- removing supplier bills referenced by those headers.
  IF receipt_ids IS NOT NULL THEN
    DELETE FROM public.stock_receipts receipt
    WHERE receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipt_items item WHERE item.receipt_id = receipt.id);
    GET DIAGNOSTICS deleted_receipts = ROW_COUNT;
  END IF;

  IF supplier_bill_ids IS NOT NULL THEN
    DELETE FROM public.supplier_payments payment
    WHERE payment.supplier_bill_id = ANY(supplier_bill_ids)
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipts receipt WHERE receipt.supplier_bill_id = payment.supplier_bill_id);
    DELETE FROM public.supplier_bills bill
    WHERE bill.id = ANY(supplier_bill_ids)
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipts receipt WHERE receipt.supplier_bill_id = bill.id);
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'Owner'), 'products', p_product_id, 'PRODUCT_FORCE_DELETED',
    jsonb_build_object('product_name', product_row.name, 'deleted_movements', deleted_movements,
      'deleted_batches', deleted_batches, 'deleted_receipt_items', deleted_receipt_items,
      'deleted_receipts', deleted_receipts, 'invoice_history_preserved', TRUE,
      'receipt_cancellation_bypassed', TRUE));

  DELETE FROM public.products WHERE id = p_product_id;
  RETURN jsonb_build_object('productName', product_row.name, 'invoiceHistoryPreserved', TRUE,
    'deletedMovements', deleted_movements, 'deletedBatches', deleted_batches,
    'deletedReceiptItems', deleted_receipt_items, 'deletedReceipts', deleted_receipts);
END;
$$;

CREATE OR REPLACE FUNCTION public.force_delete_stock_receipt(p_receipt_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_row public.stock_receipts%ROWTYPE;
  product_ids UUID[];
  actor_name TEXT;
  remaining_quantity NUMERIC;
  remaining_value NUMERIC;
  remaining_average NUMERIC;
  affected_product_id UUID;
  deleted_items INTEGER := 0;
  deleted_movements INTEGER := 0;
  deleted_batches INTEGER := 0;
BEGIN
  IF public.current_user_role() <> 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus pembelian secara permanen';
  END IF;

  SELECT * INTO receipt_row FROM public.stock_receipts WHERE id = p_receipt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penerimaan stok tidak ditemukan'; END IF;

  SELECT ARRAY_AGG(DISTINCT product_id) INTO product_ids
  FROM public.stock_receipt_items WHERE receipt_id = p_receipt_id;

  DELETE FROM public.stock_batch_allocations allocation
  USING public.stock_batches batch, public.stock_receipt_items item
  WHERE allocation.batch_id = batch.id AND batch.receipt_item_id = item.id AND item.receipt_id = p_receipt_id;
  DELETE FROM public.stock_batches batch
  USING public.stock_receipt_items item
  WHERE batch.receipt_item_id = item.id AND item.receipt_id = p_receipt_id;
  GET DIAGNOSTICS deleted_batches = ROW_COUNT;
  DELETE FROM public.stock_movements WHERE receipt_id = p_receipt_id;
  GET DIAGNOSTICS deleted_movements = ROW_COUNT;
  DELETE FROM public.stock_receipt_items WHERE receipt_id = p_receipt_id;
  GET DIAGNOSTICS deleted_items = ROW_COUNT;

  FOR affected_product_id IN SELECT value FROM UNNEST(COALESCE(product_ids, ARRAY[]::UUID[])) AS values(value)
  LOOP
    SELECT COALESCE(SUM(batch.quantity_remaining), 0), COALESCE(SUM(batch.quantity_remaining * batch.unit_cost), 0)
    INTO remaining_quantity, remaining_value
    FROM public.stock_batches batch
    WHERE batch.product_id = affected_product_id AND batch.quantity_remaining > 0 AND batch.status = 'OPEN';
    remaining_average := CASE WHEN remaining_quantity > 0 THEN ROUND(remaining_value / remaining_quantity, 2) ELSE 0 END;
    UPDATE public.stock_balances SET quantity = remaining_quantity, average_unit_cost = remaining_average, updated_at = NOW()
    WHERE stock_balances.product_id = affected_product_id;
  END LOOP;

  IF receipt_row.supplier_bill_id IS NOT NULL THEN
    DELETE FROM public.supplier_payments WHERE supplier_bill_id = receipt_row.supplier_bill_id;
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'Owner'), 'stock_receipts', p_receipt_id, 'STOCK_RECEIPT_FORCE_DELETED',
    jsonb_build_object('receipt_number', receipt_row.receipt_number, 'deleted_items', deleted_items,
      'deleted_movements', deleted_movements, 'deleted_batches', deleted_batches,
      'invoice_history_preserved', TRUE, 'receipt_cancellation_bypassed', TRUE));

  -- Remove the referencing receipt before its supplier bill.
  DELETE FROM public.stock_receipts WHERE id = p_receipt_id;
  IF receipt_row.supplier_bill_id IS NOT NULL THEN
    DELETE FROM public.supplier_bills bill
    WHERE bill.id = receipt_row.supplier_bill_id
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipts receipt WHERE receipt.supplier_bill_id = bill.id);
  END IF;

  RETURN jsonb_build_object('receiptNumber', receipt_row.receipt_number, 'invoiceHistoryPreserved', TRUE,
    'deletedItems', deleted_items, 'deletedMovements', deleted_movements, 'deletedBatches', deleted_batches);
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_product(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.force_delete_stock_receipt(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_delete_product(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_stock_receipt(UUID) TO authenticated;
