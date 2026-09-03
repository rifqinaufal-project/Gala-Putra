-- Fix trigger handle_new_user to safely parse user_role enum and catch exceptions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  profile_count INT;
  user_full_name TEXT;
  user_role_val public.user_role;
BEGIN
  -- Safely extract full_name
  user_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', 'User');

  -- Safely parse role enum without throwing casting exception
  BEGIN
    IF (NEW.raw_user_meta_data->>'role') = 'OWNER' THEN
      user_role_val := 'OWNER'::public.user_role;
    ELSIF (NEW.raw_user_meta_data->>'role') = 'FINANCE' THEN
      user_role_val := 'FINANCE'::public.user_role;
    ELSE
      user_role_val := 'STAFF'::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    user_role_val := 'STAFF'::public.user_role;
  END;

  SELECT COUNT(*) INTO profile_count FROM public.profiles;

  IF profile_count = 0 THEN
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, 'owner@sultansf.id'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Owner'),
      'OWNER'::public.user_role,
      'APPROVED'::public.profile_status
    )
    ON CONFLICT (id) DO UPDATE SET role = 'OWNER'::public.user_role, status = 'APPROVED'::public.profile_status;
  ELSE
    INSERT INTO public.profiles (id, email, full_name, role, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, 'user@sultansf.id'),
      user_full_name,
      user_role_val,
      'PENDING'::public.profile_status
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ensure auth user creation is never blocked
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
