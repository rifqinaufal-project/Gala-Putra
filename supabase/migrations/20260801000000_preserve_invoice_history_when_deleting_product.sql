-- A product is master data. Invoice items keep immutable snapshots of the
-- product name, unit, selling price, purchase price, subtotal, and profit.
-- Allow the master product to be deleted while retaining that history.

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey;

ALTER TABLE public.invoice_items
  ALTER COLUMN product_id DROP NOT NULL;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.products(id)
  ON DELETE SET NULL;
