CREATE TABLE IF NOT EXISTS public.personal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  content TEXT NOT NULL DEFAULT '' CHECK (char_length(content) <= 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_notes_user_updated
  ON public.personal_notes(user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_personal_note_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_personal_notes_updated_at ON public.personal_notes;
CREATE TRIGGER trg_personal_notes_updated_at
BEFORE UPDATE ON public.personal_notes
FOR EACH ROW EXECUTE FUNCTION public.set_personal_note_updated_at();

ALTER TABLE public.personal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_notes_select_own ON public.personal_notes;
DROP POLICY IF EXISTS personal_notes_insert_own ON public.personal_notes;
DROP POLICY IF EXISTS personal_notes_update_own ON public.personal_notes;
DROP POLICY IF EXISTS personal_notes_delete_own ON public.personal_notes;

CREATE POLICY personal_notes_select_own ON public.personal_notes
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY personal_notes_insert_own ON public.personal_notes
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY personal_notes_update_own ON public.personal_notes
FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY personal_notes_delete_own ON public.personal_notes
FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = user_id);
