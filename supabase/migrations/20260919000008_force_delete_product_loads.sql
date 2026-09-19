-- Product deletion also fails with ON DELETE RESTRICT when a product is used in
-- a load (load_items, load_reconciliation_items) or has reject stock. Clean those
-- references by force-deleting the related loads before removing the product.
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
  load_id_value UUID;
  deleted_movements INTEGER := 0;
  deleted_batches INTEGER := 0;
  deleted_receipt_items INTEGER := 0;
  deleted_receipts INTEGER := 0;
  deleted_loads INTEGER := 0;
BEGIN
  IF public.current_user_role() <> 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus produk secara permanen';
  END IF;

  SELECT * INTO product_row FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  -- Loads that contain this product (load_items / reconciliation / reject stock)
  -- must be removed first because they reference the product with RESTRICT.
  FOR load_id_value IN
    SELECT DISTINCT li.load_id
    FROM public.load_items li
    WHERE li.product_id = p_product_id
  LOOP
    PERFORM public.force_delete_load_transaction(load_id_value);
    deleted_loads := deleted_loads + 1;
  END LOOP;

  SELECT ARRAY_AGG(DISTINCT receipt_item.receipt_id), ARRAY_AGG(DISTINCT receipt.supplier_bill_id)
  INTO receipt_ids, supplier_bill_ids
  FROM public.stock_receipt_items receipt_item
  JOIN public.stock_receipts receipt ON receipt.id = receipt_item.receipt_id
  WHERE receipt_item.product_id = p_product_id;

  -- Reject stock references the product with RESTRICT.
  DELETE FROM public.reject_stock_movements WHERE product_id = p_product_id;
  DELETE FROM public.reject_stock_lots WHERE product_id = p_product_id;
  DELETE FROM public.reject_stock_balances WHERE product_id = p_product_id;

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
      'deleted_receipts', deleted_receipts, 'deleted_loads', deleted_loads,
      'invoice_history_preserved', TRUE, 'receipt_cancellation_bypassed', TRUE));

  DELETE FROM public.products WHERE id = p_product_id;
  RETURN jsonb_build_object('productName', product_row.name, 'invoiceHistoryPreserved', TRUE,
    'deletedMovements', deleted_movements, 'deletedBatches', deleted_batches,
    'deletedReceiptItems', deleted_receipt_items, 'deletedReceipts', deleted_receipts,
    'deletedLoads', deleted_loads);
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_product(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_product(UUID) TO authenticated;
