-- The previous reporting migration was already applied before its RPC gained
-- the include-items/include-costs arguments. A new migration is required so
-- Supabase applies the changed function signature to remote databases.
CREATE OR REPLACE FUNCTION public.get_invoices_secure_range(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 5000,
  p_include_items BOOLEAN DEFAULT FALSE,
  p_include_direct_costs BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_value public.user_role := public.current_user_role();
  result_value JSONB;
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
BEGIN
  IF role_value IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'createdAt' DESC), '[]'::jsonb)
  INTO result_value
  FROM (
    SELECT jsonb_build_object(
      'id', i.id, 'publicToken', i.public_token, 'invoiceNumber', i.invoice_number,
      'customerId', i.customer_id, 'customerName', c.name, 'customerPhone', c.phone,
      'issueDate', i.issue_date, 'dueDate', i.due_date,
      'status', CASE WHEN i.status IN ('ISSUED','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE i.status::TEXT END,
      'subtotal', i.subtotal, 'discount', i.discount, 'total', i.total, 'totalPaid', i.total_paid,
      'remainingBalance', i.remaining_balance,
      'totalProductCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.total_product_cost ELSE 0 END,
      'totalDirectCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.total_direct_cost ELSE 0 END,
      'productProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.product_profit ELSE 0 END,
      'transactionProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.transaction_profit ELSE 0 END,
      'transactionMargin', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.transaction_margin ELSE 0 END,
      'notes', i.notes, 'createdBy', i.created_by, 'createdAt', i.created_at, 'updatedAt', i.updated_at,
      'items', CASE WHEN p_include_items THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', ii.id, 'productId', ii.product_id, 'descriptionSnapshot', ii.description_snapshot,
        'quantity', ii.quantity, 'marginQuantity', ii.margin_quantity, 'billingQuantity', ii.quantity + ii.margin_quantity,
        'unit', ii.unit, 'sellingPriceSnapshot', ii.selling_price_snapshot,
        'purchasePriceSnapshot', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.purchase_price_snapshot ELSE 0 END,
        'subtotal', ii.subtotal, 'totalPurchaseCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.product_cost_total ELSE 0 END,
        'productProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.profit ELSE 0 END
      ) ORDER BY ii.created_at) FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb) ELSE '[]'::jsonb END,
      'directCosts', CASE WHEN p_include_direct_costs AND role_value IN ('OWNER','FINANCE') THEN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', dc.id, 'category', dc.category, 'name', dc.name, 'amount', dc.amount, 'notes', dc.notes
      ) ORDER BY dc.created_at) FROM public.invoice_direct_costs dc WHERE dc.invoice_id = i.id), '[]'::jsonb) ELSE '[]'::jsonb END
    ) AS row_data
    FROM public.invoices i
    JOIN public.customers c ON c.id = i.customer_id
    WHERE (p_start_date IS NULL OR i.issue_date >= p_start_date)
      AND (p_end_date IS NULL OR i.issue_date <= p_end_date)
      AND (role_value IN ('OWNER','FINANCE') OR i.created_by = auth.uid())
    ORDER BY i.created_at DESC
    LIMIT safe_limit
  ) rows;
  RETURN result_value;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invoices_secure_range(DATE, DATE, INTEGER, BOOLEAN, BOOLEAN) TO authenticated;
