-- Add missing RLS policies for products, product_costs, customer_prices, and customers

DROP POLICY IF EXISTS "Allow authenticated insert products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated update products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated delete products" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated insert product_costs" ON public.product_costs;
DROP POLICY IF EXISTS "Allow authenticated update product_costs" ON public.product_costs;
DROP POLICY IF EXISTS "Allow authenticated delete product_costs" ON public.product_costs;
DROP POLICY IF EXISTS "Allow authenticated delete customer_prices" ON public.customer_prices;
DROP POLICY IF EXISTS "Allow authenticated delete customers" ON public.customers;

CREATE POLICY "Allow authenticated insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update products" ON public.products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete products" ON public.products FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert product_costs" ON public.product_costs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update product_costs" ON public.product_costs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete product_costs" ON public.product_costs FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete customer_prices" ON public.customer_prices FOR DELETE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete customers" ON public.customers FOR DELETE TO authenticated USING (true);
