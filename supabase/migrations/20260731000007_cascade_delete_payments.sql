-- Update foreign key constraint on public.payments to ON DELETE CASCADE
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_invoice_id_fkey;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_invoice_id_fkey
    FOREIGN KEY (invoice_id)
    REFERENCES public.invoices(id)
    ON DELETE CASCADE;
