-- Staging transaction linking for statement review workflow

DO $$ BEGIN
  ALTER TYPE public.link_type ADD VALUE IF NOT EXISTS 'internal_transfer';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.link_type ADD VALUE IF NOT EXISTS 'credit_card_payment';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.link_type ADD VALUE IF NOT EXISTS 'loan_repayment';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.staging_transaction_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_import_id uuid NOT NULL REFERENCES public.file_imports(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id),
  from_staging_id uuid NOT NULL REFERENCES public.import_staging(id) ON DELETE CASCADE,
  to_staging_id uuid NULL REFERENCES public.import_staging(id) ON DELETE CASCADE,
  to_transaction_id uuid NULL REFERENCES public.statement_transactions(id) ON DELETE CASCADE,
  link_type public.link_type NOT NULL,
  link_score numeric NOT NULL DEFAULT 0 CHECK (link_score >= 0 AND link_score <= 1),
  link_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.mapping_status NOT NULL DEFAULT 'needs_review',
  matched_by text NOT NULL DEFAULT 'system' CHECK (matched_by IN ('system', 'user')),
  matched_by_user_id uuid NULL REFERENCES public.user_profiles(id),
  reviewed_by uuid NULL REFERENCES public.user_profiles(id),
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staging_transaction_links_target_required_chk CHECK (
    (to_staging_id IS NOT NULL) <> (to_transaction_id IS NOT NULL)
  ),
  CONSTRAINT staging_transaction_links_not_self_chk CHECK (to_staging_id IS NULL OR from_staging_id <> to_staging_id)
);

DROP INDEX IF EXISTS staging_transaction_links_lookup_uq;
CREATE UNIQUE INDEX IF NOT EXISTS staging_transaction_links_lookup_uq
  ON public.staging_transaction_links (
    file_import_id,
    from_staging_id,
    COALESCE(to_staging_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(to_transaction_id, '00000000-0000-0000-0000-000000000000'::uuid),
    link_type
  );

CREATE INDEX IF NOT EXISTS staging_transaction_links_file_idx
  ON public.staging_transaction_links (file_import_id, status, link_score DESC);

CREATE INDEX IF NOT EXISTS staging_transaction_links_from_idx
  ON public.staging_transaction_links (from_staging_id, status);

ALTER TABLE public.staging_transaction_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own staging transaction links" ON public.staging_transaction_links;
CREATE POLICY "Users can view own staging transaction links" ON public.staging_transaction_links
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own staging transaction links" ON public.staging_transaction_links;
CREATE POLICY "Users can insert own staging transaction links" ON public.staging_transaction_links
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own staging transaction links" ON public.staging_transaction_links;
CREATE POLICY "Users can update own staging transaction links" ON public.staging_transaction_links
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

ALTER TABLE public.transaction_links
  ADD COLUMN IF NOT EXISTS matched_by text NOT NULL DEFAULT 'system' CHECK (matched_by IN ('system', 'user')),
  ADD COLUMN IF NOT EXISTS matched_by_user_id uuid NULL REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid NULL REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.transaction_links
  DROP CONSTRAINT IF EXISTS transaction_links_not_self_chk;
ALTER TABLE public.transaction_links
  ADD CONSTRAINT transaction_links_not_self_chk CHECK (from_transaction_id <> to_transaction_id);

CREATE UNIQUE INDEX IF NOT EXISTS transaction_links_pair_type_uq
  ON public.transaction_links (from_transaction_id, to_transaction_id, link_type);
