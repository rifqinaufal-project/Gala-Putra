-- Automatically approve new registrations.
-- The first account remains the Owner; subsequent accounts are Staff.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_count INT;
  user_full_name TEXT;
  user_role_val public.user_role;
BEGIN
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'User');
  SELECT COUNT(*) INTO profile_count FROM public.profiles;

  IF profile_count = 0 THEN
    user_role_val := 'OWNER'::public.user_role;
  ELSE
    user_role_val := 'STAFF'::public.user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, 'user@sultansf.id'),
    user_full_name,
    user_role_val,
    'APPROVED'::public.profile_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    status = 'APPROVED'::public.profile_status;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Do not block Supabase Auth user creation if profile provisioning fails.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Approve profiles created before this policy was enabled.
UPDATE public.profiles
SET status = 'APPROVED'::public.profile_status
WHERE status = 'PENDING'::public.profile_status;
