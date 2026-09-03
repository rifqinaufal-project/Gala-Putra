-- 13. COMPANY PROFILE TABLE
CREATE TABLE IF NOT EXISTS public.company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Sultan Seafood',
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  npwp TEXT,
  bank_name TEXT NOT NULL DEFAULT 'BCA',
  bank_account TEXT NOT NULL DEFAULT '1234567890',
  bank_holder TEXT NOT NULL DEFAULT 'Sultan Seafood',
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.company_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Allow anon read company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Allow authenticated insert company profile" ON public.company_profile;
DROP POLICY IF EXISTS "Allow authenticated update company profile" ON public.company_profile;

CREATE POLICY "Allow authenticated read company profile" ON public.company_profile FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon read company profile" ON public.company_profile FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated insert company profile" ON public.company_profile FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update company profile" ON public.company_profile FOR UPDATE TO authenticated USING (true);
