-- 1. SUPPLIERS
CREATE POLICY "Allow authenticated insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);

-- 2. EXPENSES
CREATE POLICY "Allow authenticated read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update expenses" ON public.expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete expenses" ON public.expenses FOR DELETE TO authenticated USING (true);

-- 3. PAYMENTS
CREATE POLICY "Allow authenticated read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated update payments" ON public.payments FOR UPDATE TO authenticated USING (true);

-- 4. AUDIT LOGS
CREATE POLICY "Allow authenticated read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
