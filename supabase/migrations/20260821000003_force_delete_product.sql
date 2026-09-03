-- Permanently remove a product and its inventory/purchase operational data.
-- Invoices are intentionally preserved: invoice_items.product_id is set to NULL
-- by its existing ON DELETE SET NULL constraint and snapshot fields remain.
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
  deleted_receipt_items INTEGER := 0;
BEGIN
  IF public.current_user_role() <> 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus produk secara permanen';
  END IF;

  SELECT * INTO product_row FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produk tidak ditemukan'; END IF;

  -- Lock the balance before removing every operational record for this product.
  PERFORM 1 FROM public.stock_balances WHERE product_id = p_product_id FOR UPDATE;

  SELECT ARRAY_AGG(DISTINCT receipt_id) INTO receipt_ids
  FROM public.stock_receipt_items
  WHERE product_id = p_product_id;

  DELETE FROM public.stock_batch_allocations allocation
  USING public.stock_batches batch
  WHERE allocation.batch_id = batch.id AND batch.product_id = p_product_id;

  DELETE FROM public.stock_batches WHERE product_id = p_product_id;
  DELETE FROM public.product_cost_history WHERE product_id = p_product_id;

  -- Delete movements before receipt items because movements may reference them.
  DELETE FROM public.stock_movements WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_movements = ROW_COUNT;

  DELETE FROM public.stock_receipt_items WHERE product_id = p_product_id;
  GET DIAGNOSTICS deleted_receipt_items = ROW_COUNT;

  -- A receipt can contain several products. Only delete headers that became empty.
  IF receipt_ids IS NOT NULL THEN
    DELETE FROM public.supplier_payments payment
    USING public.supplier_bills bill, public.stock_receipts receipt
    WHERE payment.supplier_bill_id = bill.id
      AND receipt.supplier_bill_id = bill.id
      AND receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipt_items item WHERE item.receipt_id = receipt.id);

    DELETE FROM public.supplier_bills bill
    USING public.stock_receipts receipt
    WHERE receipt.supplier_bill_id = bill.id
      AND receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipt_items item WHERE item.receipt_id = receipt.id);

    DELETE FROM public.stock_receipts receipt
    WHERE receipt.id = ANY(receipt_ids)
      AND NOT EXISTS (SELECT 1 FROM public.stock_receipt_items item WHERE item.receipt_id = receipt.id);
  END IF;

  -- customer_prices and product_costs use ON DELETE CASCADE. stock_balances also
  -- cascades; invoice_items deliberately retain their immutable snapshots.
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (auth.uid(), COALESCE(actor_name, 'Owner'), 'products', p_product_id, 'PRODUCT_FORCE_DELETED',
    jsonb_build_object(
      'product_name', product_row.name,
      'deleted_stock_movements', deleted_movements,
      'deleted_receipt_items', deleted_receipt_items,
      'invoice_history_preserved', TRUE
    ));

  DELETE FROM public.products WHERE id = p_product_id;
  RETURN jsonb_build_object('productName', product_row.name, 'invoiceHistoryPreserved', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_product(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_delete_product(UUID) TO authenticated;
