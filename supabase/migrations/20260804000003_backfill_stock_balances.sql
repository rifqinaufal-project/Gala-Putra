-- Ensure every existing product has a row in stock_balances.
-- Products created before the inventory_management migration may be missing rows.
INSERT INTO public.stock_balances (product_id)
SELECT id FROM public.products
ON CONFLICT (product_id) DO NOTHING;
