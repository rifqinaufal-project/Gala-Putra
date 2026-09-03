-- 14. USER APPROVAL STATUS & PROFILES RLS
DO $$ BEGIN
  CREATE TYPE profile_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS status profile_status NOT NULL DEFAULT 'PENDING';

-- Ensure existing user profiles are marked as APPROVED
UPDATE public.profiles SET status = 'APPROVED' WHERE status IS NULL OR status = 'PENDING';

-- RLS Policies for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow user to insert profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to delete profiles" ON public.profiles;

CREATE POLICY "Allow authenticated read profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow user to insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow users to update profiles" ON public.profiles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow users to delete profiles" ON public.profiles FOR DELETE TO authenticated USING (true);
