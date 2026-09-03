-- Create customer_prices table for special restaurant pricing
CREATE TABLE IF NOT EXISTS public.customer_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  selling_price NUMERIC(12, 2) NOT NULL,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_product_unique UNIQUE (customer_id, product_id)
);

ALTER TABLE public.customer_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read customer_prices" ON public.customer_prices;
DROP POLICY IF EXISTS "Allow authenticated insert customer_prices" ON public.customer_prices;
DROP POLICY IF EXISTS "Allow authenticated update customer_prices" ON public.customer_prices;

CREATE POLICY "Allow authenticated read customer_prices" ON public.customer_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert customer_prices" ON public.customer_prices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update customer_prices" ON public.customer_prices FOR UPDATE TO authenticated USING (true);
