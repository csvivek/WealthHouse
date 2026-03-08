-- ============================================================================
-- Migration: 006_statement_parse_sessions.sql
-- Purpose:   Persist parsed statement payloads for account-resolution recovery
--            so imports can continue without re-upload/re-parse.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.statement_parse_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id),
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL,
  selected_account_id uuid REFERENCES public.accounts(id),
  parsed_payload jsonb NOT NULL,
  unresolved_descriptors jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_existing_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'needs_account_resolution'
    CHECK (status IN ('needs_account_resolution', 'resolved', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS statement_parse_sessions_household_status_idx
  ON public.statement_parse_sessions (household_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS statement_parse_sessions_expiry_idx
  ON public.statement_parse_sessions (expires_at, status);

CREATE INDEX IF NOT EXISTS statement_parse_sessions_user_idx
  ON public.statement_parse_sessions (user_id, created_at DESC);

ALTER TABLE public.statement_parse_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own statement parse sessions" ON public.statement_parse_sessions;
CREATE POLICY "Users can view own statement parse sessions" ON public.statement_parse_sessions
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can insert own statement parse sessions" ON public.statement_parse_sessions;
CREATE POLICY "Users can insert own statement parse sessions" ON public.statement_parse_sessions
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can update own statement parse sessions" ON public.statement_parse_sessions;
CREATE POLICY "Users can update own statement parse sessions" ON public.statement_parse_sessions
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );
