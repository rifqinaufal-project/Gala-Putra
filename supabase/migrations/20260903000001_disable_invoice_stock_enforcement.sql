-- Invoices are financial documents only. Product inventory is not reserved,
-- checked, reduced, or restored when an invoice changes status.
CREATE OR REPLACE FUNCTION public.apply_invoice_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_invoice_stock_change() FROM PUBLIC, anon, authenticated;
