-- Make SKU optional in products table
ALTER TABLE public.products ALTER COLUMN sku DROP NOT NULL;
