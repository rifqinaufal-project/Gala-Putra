-- Support multiple company bank accounts.
-- The original single bank columns remain as the primary/legacy account, while
-- all accounts are now also stored in company_bank_accounts for invoices.

CREATE TABLE IF NOT EXISTS public.company_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_profile_id UUID NOT NULL REFERENCES public.company_profile(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  bank_account TEXT NOT NULL,
  bank_holder TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (BTRIM(bank_name) <> ''),
  CHECK (BTRIM(bank_account) <> ''),
  CHECK (BTRIM(bank_holder) <> '')
);

CREATE INDEX IF NOT EXISTS idx_company_bank_accounts_profile
  ON public.company_bank_accounts(company_profile_id);

-- Seed from the existing single account row.
INSERT INTO public.company_bank_accounts (company_profile_id, bank_name, bank_account, bank_holder, is_primary)
SELECT id, bank_name, bank_account, bank_holder, TRUE
FROM public.company_profile
ON CONFLICT DO NOTHING;

ALTER TABLE public.company_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_bank_accounts_select ON public.company_bank_accounts;
DROP POLICY IF EXISTS company_bank_accounts_owner ON public.company_bank_accounts;

CREATE POLICY company_bank_accounts_select ON public.company_bank_accounts
  FOR SELECT TO anon, authenticated USING (TRUE);

CREATE POLICY company_bank_accounts_owner ON public.company_bank_accounts
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'OWNER')
  WITH CHECK (public.current_user_role() = 'OWNER');

REVOKE ALL ON TABLE public.company_bank_accounts FROM anon;
GRANT SELECT ON TABLE public.company_bank_accounts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.company_bank_accounts TO authenticated;
