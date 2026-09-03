-- Include all bank accounts in the public invoice response.
CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'publicToken', i.public_token, 'invoiceNumber', i.invoice_number, 'customerName', c.name,
    'customerPhone', c.phone, 'issueDate', i.issue_date, 'dueDate', i.due_date,
    'status', CASE WHEN i.status IN ('ISSUED','PARTIALLY_PAID') AND i.due_date < CURRENT_DATE THEN 'OVERDUE' ELSE i.status::TEXT END,
    'subtotal', i.subtotal, 'discount', i.discount, 'total', i.total, 'notes', i.notes,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ii.id, 'descriptionSnapshot', ii.description_snapshot,
      'quantity', ii.quantity, 'unit', ii.unit, 'sellingPriceSnapshot', ii.selling_price_snapshot, 'subtotal', ii.subtotal) ORDER BY ii.created_at)
      FROM public.invoice_items ii WHERE ii.invoice_id = i.id), '[]'::jsonb),
    'company', jsonb_build_object(
      'name', cp.name, 'address', cp.address, 'phone', cp.phone, 'email', cp.email,
      'website', cp.website, 'bankName', cp.bank_name, 'bankAccount', cp.bank_account, 'bankHolder', cp.bank_holder, 'logoUrl', cp.logo_url,
      'bankAccounts', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id', ba.id, 'bankName', ba.bank_name, 'bankAccount', ba.bank_account, 'bankHolder', ba.bank_holder, 'isPrimary', ba.is_primary) ORDER BY ba.is_primary DESC, ba.created_at ASC)
         FROM public.company_bank_accounts ba WHERE ba.company_profile_id = cp.id), '[]'::jsonb
      )
    )
  )
  FROM public.invoices i JOIN public.customers c ON c.id = i.customer_id
  LEFT JOIN LATERAL (SELECT * FROM public.company_profile ORDER BY created_at LIMIT 1) cp ON TRUE
  WHERE i.public_token = p_token AND i.status NOT IN ('DRAFT', 'VOID');
$$;

REVOKE ALL ON FUNCTION public.get_public_invoice(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_invoice(UUID) TO anon, authenticated;