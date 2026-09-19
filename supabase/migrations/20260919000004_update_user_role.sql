-- Allow Owner to change an approved user's role. Unlike approval, this can be
-- done repeatedly and keeps the target account's approval status untouched.
CREATE OR REPLACE FUNCTION public.update_user_role(
  p_user_id UUID,
  p_role public.user_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name TEXT;
  old_profile JSONB;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat mengubah role pengguna';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Owner tidak dapat mengubah role akunnya sendiri';
  END IF;

  SELECT to_jsonb(p), (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  INTO old_profile, actor_name
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF old_profile IS NULL THEN
    RAISE EXCEPTION 'Profil pengguna tidak ditemukan';
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'profiles', p_user_id,
    'USER_ROLE_CHANGED',
    jsonb_build_object('before', old_profile, 'role', p_role)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_role(UUID, public.user_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_role(UUID, public.user_role) TO authenticated;
