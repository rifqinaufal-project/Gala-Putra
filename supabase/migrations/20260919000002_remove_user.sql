-- Allow Owner to permanently remove a user. Deleting the auth.users row cascades
-- to public.profiles and, via the profiles FK, to any operational rows that track
-- the creator/recorder. The user's own audit rows are preserved by clearing their
-- user_id instead of deleting the history.
CREATE OR REPLACE FUNCTION public.remove_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_name TEXT;
  target_profile JSONB;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'OWNER'::public.user_role THEN
    RAISE EXCEPTION 'Hanya Owner yang dapat menghapus pengguna';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Owner tidak dapat menghapus akunnya sendiri';
  END IF;

  SELECT to_jsonb(p), (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  INTO target_profile, actor_name
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF target_profile IS NULL THEN
    RAISE EXCEPTION 'Profil pengguna tidak ditemukan';
  END IF;

  -- Keep the audit trail even after the auth account is gone.
  UPDATE public.audit_logs
  SET user_id = NULL
  WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
  VALUES (
    auth.uid(), COALESCE(actor_name, 'Owner'), 'profiles', p_user_id,
    'USER_REMOVED',
    jsonb_build_object('before', target_profile)
  );

  -- Removing the auth.users row cascades to profiles and, through profiles.id,
  -- to rows whose created_by/recorded_by/... reference the user.
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_user(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_user(UUID) TO authenticated;
