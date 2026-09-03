CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'publicToken', i.public_token, 'invoiceNumber', i.invoice_number, 'customerName', c.name,
    'customerPhone', c.phone, 'issueDate', i.issue_date, 'dueDate', i.due_date,
    'status', CASE WHEN i.status IN ('ISSUED','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE i.status::TEXT END,
    'subtotal', i.subtotal, 'discount', i.discount, 'total', i.total, 'notes', i.notes,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ii.id, 'descriptionSnapshot', ii.description_snapshot,
      'quantity', ii.quantity, 'marginQuantity', ii.margin_quantity, 'billingQuantity', ii.quantity + ii.margin_quantity,
      'unit', ii.unit, 'sellingPriceSnapshot', ii.selling_price_snapshot, 'subtotal', ii.subtotal) ORDER BY ii.created_at)
      FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb),
    'company', jsonb_build_object('name', cp.name, 'address', cp.address, 'phone', cp.phone, 'email', cp.email,
      'website', cp.website, 'bankName', cp.bank_name, 'bankAccount', cp.bank_account, 'bankHolder', cp.bank_holder, 'logoUrl', cp.logo_url)
  )
  FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id
  LEFT JOIN LATERAL (SELECT * FROM public.company_profile ORDER BY created_at LIMIT 1) cp ON TRUE
  WHERE i.public_token = p_token AND i.status NOT IN ('DRAFT', 'VOID');
$$;

CREATE OR REPLACE FUNCTION public.get_invoices_secure(p_invoice_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE role_value public.user_role := public.current_user_role(); result_value JSONB;
BEGIN
  IF role_value IS NULL THEN RAISE EXCEPTION 'Akun belum disetujui'; END IF;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'createdAt' DESC), '[]'::jsonb) INTO result_value
  FROM (
    SELECT jsonb_build_object(
      'id', i.id, 'publicToken', i.public_token, 'invoiceNumber', i.invoice_number,
      'customerId', i.customer_id, 'customerName', c.name, 'customerPhone', c.phone,
      'issueDate', i.issue_date, 'dueDate', i.due_date,
      'status', CASE WHEN i.status IN ('ISSUED','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE i.status::TEXT END,
      'subtotal', i.subtotal, 'discount', i.discount, 'total', i.total, 'totalPaid', i.total_paid, 'remainingBalance', i.remaining_balance,
      'totalProductCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.total_product_cost ELSE 0 END,
      'totalDirectCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.total_direct_cost ELSE 0 END,
      'productProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.product_profit ELSE 0 END,
      'transactionProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.transaction_profit ELSE 0 END,
      'transactionMargin', CASE WHEN role_value IN ('OWNER','FINANCE') THEN i.transaction_margin ELSE 0 END,
      'notes', i.notes, 'createdBy', i.created_by, 'createdAt', i.created_at, 'updatedAt', i.updated_at,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', ii.id, 'productId', ii.product_id, 'descriptionSnapshot', ii.description_snapshot,
        'quantity', ii.quantity, 'marginQuantity', ii.margin_quantity, 'billingQuantity', ii.quantity + ii.margin_quantity,
        'unit', ii.unit, 'sellingPriceSnapshot', ii.selling_price_snapshot,
        'purchasePriceSnapshot', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.purchase_price_snapshot ELSE 0 END,
        'subtotal', ii.subtotal, 'totalPurchaseCost', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.product_cost_total ELSE 0 END,
        'productProfit', CASE WHEN role_value IN ('OWNER','FINANCE') THEN ii.profit ELSE 0 END
      ) ORDER BY ii.created_at) FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb),
      'directCosts', CASE WHEN role_value IN ('OWNER','FINANCE') THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', dc.id, 'category', dc.category, 'name', dc.name, 'amount', dc.amount, 'notes', dc.notes) ORDER BY dc.created_at) FROM public.invoice_direct_costs dc WHERE dc.invoice_id = i.id), '[]'::jsonb) ELSE '[]'::jsonb END
    ) AS row_data
    FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id
    WHERE (p_invoice_id IS NULL OR i.id = p_invoice_id) AND (role_value IN ('OWNER','FINANCE') OR i.created_by = auth.uid())
  ) rows;
  RETURN result_value;
END;
$$;
