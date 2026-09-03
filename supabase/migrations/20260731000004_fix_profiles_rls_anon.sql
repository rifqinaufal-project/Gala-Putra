-- Allow anon and authenticated users to insert/upsert profiles during registration
DROP POLICY IF EXISTS "Allow anon insert profile" ON public.profiles;
CREATE POLICY "Allow anon insert profile" ON public.profiles FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read profiles" ON public.profiles;
CREATE POLICY "Allow anon read profiles" ON public.profiles FOR SELECT TO anon USING (true);
