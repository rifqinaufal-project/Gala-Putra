-- Load and factory-reject quantities are canonical kilograms. Normalize old
-- seafood products that were saved as ton so a 500 kg reject cannot render as
-- 500 ton in the normal product inventory.
UPDATE public.products
SET default_unit = 'kg', updated_at = NOW()
WHERE LOWER(default_unit) IN ('ton', 'tons', 'tonase')
  AND id IN (
    SELECT product_id FROM public.load_items
    UNION
    SELECT product_id FROM public.reject_stock_balances
  );
