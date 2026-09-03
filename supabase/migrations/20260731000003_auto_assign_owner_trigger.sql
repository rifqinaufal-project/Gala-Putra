-- 15. AUTOMATIC OWNER ASSIGNMENT TRIGGER FOR SUPABASE AUTH
-- Creates a profile in public.profiles whenever a user signs up via auth.users.
-- The very first registered user in the database is automatically assigned the OWNER role & APPROVED status.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_count INT;
BEGIN
  SELECT COUNT(*) INTO profile_count FROM public.profiles;

  IF profile_count = 0 THEN
    -- First user registered in Supabase is automatically OWNER and APPROVED
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, 'owner@sultansf.id'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Owner'),
      'OWNER'::user_role,
      'APPROVED'::profile_status
    )
    ON CONFLICT (id) DO UPDATE SET role = 'OWNER', status = 'APPROVED';
  ELSE
    -- Subsequent users get requested role (or STAFF) and PENDING status
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, 'user@sultansf.id'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
      COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'STAFF'::user_role),
      'PENDING'::profile_status
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- For existing users in auth.users who don't have a record in public.profiles yet:
-- Make the earliest registered user in auth.users the OWNER with APPROVED status.
INSERT INTO public.profiles (id, email, full_name, role, status)
SELECT 
  id, 
  COALESCE(email, 'owner@sultansf.id'), 
  COALESCE(raw_user_meta_data->>'full_name', 'Owner'),
  'OWNER'::user_role,
  'APPROVED'::profile_status
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (id) DO UPDATE SET role = 'OWNER', status = 'APPROVED';
