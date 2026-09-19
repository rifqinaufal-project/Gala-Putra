-- Make customers and suppliers fully deletable even when referenced by
-- operational history. Deleting a master record force-removes its dependent
-- rows in FK-safe order (reusing the existing force-delete helpers), so no
-- ON DELETE RESTRICT violation can occur.
--
-- HPP history (product_costs) keeps its rows but drops the supplier link,
-- matching the SET NULL behaviour already used by stock movements/batches.

-- 1. Preserve HPP history while allowing supplier deletion.
ALTER TABLE public.product_costs
  DROP CONSTRAINT IF EXISTS product_costs_supplier_id_fkey;
ALTER TABLE public.product_costs
  ADD CONSTRAINT product_costs_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

-- 2. Force-delete a customer (pabrik/pembeli) and all related rows.
CREATE OR REPLACE FUNCTION public.force_delete_customer(p_customer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  customer_row public.customers%ROWTYPE;
  load_id_value UUID;
  invoice_id_value UUID;
  deleted_loads INTEGER := 0;
  deleted_invoices INTEGER := 0;
  actor_name TEXT;
BEGIN
  IF actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus pelanggan secara permanen';
  END IF;

  SELECT * INTO customer_row
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pelanggan tidak ditemukan'; END IF;

  -- Loads destined to this customer (factory invoices) and their invoices.
  FOR load_id_value IN
    SELECT id FROM public.loads WHERE destination_id = p_customer_id
  LOOP
    PERFORM public.force_delete_load_transaction(load_id_value);
    deleted_loads := deleted_loads + 1;
  END LOOP;

  -- Remaining invoices for this customer (standard sales), plus payments.
  FOR invoice_id_value IN
    SELECT id FROM public.invoices WHERE customer_id = p_customer_id
  LOOP
    PERFORM public.force_delete_invoice(invoice_id_value);
    deleted_invoices := deleted_invoices + 1;
  END LOOP;

  -- customer_prices cascade; stock_movements.customer_id is SET NULL.
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'customers', p_customer_id,
    'CUSTOMER_FORCE_DELETED',
    jsonb_build_object(
      'name', customer_row.name,
      'deleted_loads', deleted_loads,
      'deleted_invoices', deleted_invoices
    )
  );

  DELETE FROM public.customers WHERE id = p_customer_id;

  RETURN jsonb_build_object(
    'name', customer_row.name,
    'deletedLoads', deleted_loads,
    'deletedInvoices', deleted_invoices
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_customer(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_customer(UUID) TO authenticated;

-- 3. Force-delete a supplier (TPI/sumber) and all related rows.
CREATE OR REPLACE FUNCTION public.force_delete_supplier(p_supplier_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.user_role := public.current_user_role();
  supplier_row public.suppliers%ROWTYPE;
  load_id_value UUID;
  receipt_id_value UUID;
  deleted_loads INTEGER := 0;
  deleted_receipts INTEGER := 0;
  deleted_bills INTEGER := 0;
  actor_name TEXT;
BEGIN
  IF actor_role <> 'OWNER' THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus supplier secara permanen';
  END IF;

  SELECT * INTO supplier_row
  FROM public.suppliers
  WHERE id = p_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier tidak ditemukan'; END IF;

  -- Loads that purchased from this supplier (removes load_items + their bills).
  FOR load_id_value IN
    SELECT DISTINCT li.load_id
    FROM public.load_items li
    WHERE li.source_id = p_supplier_id
  LOOP
    PERFORM public.force_delete_load_transaction(load_id_value);
    deleted_loads := deleted_loads + 1;
  END LOOP;

  -- Stock receipts from this supplier (removes receipts + their bills).
  FOR receipt_id_value IN
    SELECT id FROM public.stock_receipts WHERE supplier_id = p_supplier_id
  LOOP
    PERFORM public.force_delete_stock_receipt(receipt_id_value);
    deleted_receipts := deleted_receipts + 1;
  END LOOP;

  -- Manually created bills not tied to a load or receipt.
  DELETE FROM public.supplier_payments
  WHERE supplier_bill_id IN (
    SELECT id FROM public.supplier_bills WHERE supplier_id = p_supplier_id
  );
  DELETE FROM public.supplier_bills WHERE supplier_id = p_supplier_id;
  GET DIAGNOSTICS deleted_bills = ROW_COUNT;

  -- product_costs.supplier_id, stock_movements.supplier_id and
  -- stock_batches.supplier_id are all SET NULL via their FKs.
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'suppliers', p_supplier_id,
    'SUPPLIER_FORCE_DELETED',
    jsonb_build_object(
      'name', supplier_row.name,
      'deleted_loads', deleted_loads,
      'deleted_receipts', deleted_receipts,
      'deleted_bills', deleted_bills
    )
  );

  DELETE FROM public.suppliers WHERE id = p_supplier_id;

  RETURN jsonb_build_object(
    'name', supplier_row.name,
    'deletedLoads', deleted_loads,
    'deletedReceipts', deleted_receipts,
    'deletedBills', deleted_bills
  );
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_supplier(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_supplier(UUID) TO authenticated;
