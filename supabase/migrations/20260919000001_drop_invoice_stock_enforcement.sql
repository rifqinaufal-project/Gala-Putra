-- Invoices are financial documents only. Product inventory is never reserved,
-- checked, reduced, or restored by invoice lifecycle changes. Stock is treated
-- purely as an internal record (penerimaan stok, penyesuaian, dan catatan).
--
-- Drop the deferred constraint trigger entirely so no invoice insert/update can
-- ever run stock checks again, regardless of any prior function definition.

DROP TRIGGER IF EXISTS trg_apply_invoice_stock_change ON public.invoices;

-- Keep the function as a hard no-op in case the trigger is re-created elsewhere.
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
