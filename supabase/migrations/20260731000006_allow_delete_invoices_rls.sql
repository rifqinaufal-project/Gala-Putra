-- Allow authenticated users to delete invoices, invoice items, direct costs, and payments
DROP POLICY IF EXISTS "Allow authenticated delete invoices" ON public.invoices;
CREATE POLICY "Allow authenticated delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated delete invoice items" ON public.invoice_items;
CREATE POLICY "Allow authenticated delete invoice items" ON public.invoice_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated delete invoice direct costs" ON public.invoice_direct_costs;
CREATE POLICY "Allow authenticated delete invoice direct costs" ON public.invoice_direct_costs FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated delete payments" ON public.payments;
CREATE POLICY "Allow authenticated delete payments" ON public.payments FOR DELETE TO authenticated USING (true);
