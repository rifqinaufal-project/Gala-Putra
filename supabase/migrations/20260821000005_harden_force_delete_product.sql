-- Harden the product force-delete path. This function never calls receipt
-- cancellation, because force deletion intentionally removes product-related
-- operational records even when later stock movements exist.
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
  deleted_movements INTEGER := 0;
  deleted_batches INTEGER := 0;
  deleted_receipt_items INTEGER := 0;
  deleted_receipts INTEGER := 0;
BEGIN
  IF public.current_user_role() <> 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus produk secara permanen';
  END IF;

  SELECT * INTO product_row
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  SELECT ARRAY_AGG(DISTINCT receipt_item.receipt_id)
  INTO receipt_ids
  FROM public.stock_receipt_items AS receipt_item
  WHERE receipt_item.product_id = p_product_id;

  -- Remove dependent records in FK-safe order. No stock reversal is created:
  -- this is an explicit destructive cleanup requested by the Owner.
  DELETE FROM public.stock_batch_allocations AS allocation
  USING public.stock_batches AS batch
  WHERE allocation.batch_id = batch.id
    AND batch.product_id = p_product_id;

  DELETE FROM public.stock_batches
  WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_batches = ROW_COUNT;

  DELETE FROM public.product_cost_history
  WHERE product_id = p_product_id;

  DELETE FROM public.stock_movements
  WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_movements = ROW_COUNT;

  DELETE FROM public.stock_receipt_items
  WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_receipt_items = ROW_COUNT;

  -- Preserve receipts that still contain other products. Remove a receipt,
  -- payable, and its payments only when this product was its last item.
  IF receipt_ids IS NOT NULL THEN
    DELETE FROM public.supplier_payments AS payment
    USING public.supplier_bills AS bill, public.stock_receipts AS receipt
    WHERE payment.supplier_bill_id = bill.id
      AND receipt.supplier_bill_id = bill.id
      AND receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_receipt_items AS item
        WHERE item.receipt_id = receipt.id
      );

    DELETE FROM public.supplier_bills AS bill
    USING public.stock_receipts AS receipt
    WHERE receipt.supplier_bill_id = bill.id
      AND receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_receipt_items AS item
        WHERE item.receipt_id = receipt.id
      );

    DELETE FROM public.stock_receipts AS receipt
    WHERE receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_receipt_items AS item
        WHERE item.receipt_id = receipt.id
      );
    GET DIAGNOSTICS deleted_receipts = ROW_COUNT;
  END IF;

  SELECT full_name INTO actor_name
  FROM public.profiles
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'products', p_product_id,
    'PRODUCT_FORCE_DELETED',
    jsonb_build_object(
      'product_name', product_row.name,
      'deleted_movements', deleted_movements,
      'deleted_batches', deleted_batches,
      'deleted_receipt_items', deleted_receipt_items,
      'deleted_receipts', deleted_receipts,
      'invoice_history_preserved', TRUE,
      'receipt_cancellation_bypassed', TRUE
    )
  );

  -- Existing invoice_items.product_id ON DELETE SET NULL preserves invoice
  -- snapshots while the product master and its operational data are removed.
  DELETE FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'productName', product_row.name,
    'invoiceHistoryPreserved', TRUE,
    'deletedMovements', deleted_movements,
    'deletedBatches', deleted_batches,
    'deletedReceiptItems', deleted_receipt_items,
    'deletedReceipts', deleted_receipts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_delete_product(UUID) TO authenticated;
