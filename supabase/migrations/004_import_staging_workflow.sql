-- ============================================================================
-- Migration: 004_import_staging_workflow.sql
-- Purpose:   Add file import registry, staging table, and approval log
--            to support human review before final transaction insertion.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Enums
-- --------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.file_import_status AS ENUM (
    'received', 'parsing', 'in_review', 'committing', 'committed', 'rejected', 'duplicate', 'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.staging_review_status AS ENUM (
    'pending', 'approved', 'rejected', 'committed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.staging_duplicate_status AS ENUM (
    'none', 'existing_final', 'within_import'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.approval_action AS ENUM (
    'edit', 'approve', 'reject', 'bulk_approve', 'bulk_reject', 'commit'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2. file_imports — upload registry & review workflow parent
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.file_imports (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id                  uuid        NOT NULL REFERENCES public.households(id),
  account_id                    uuid        NOT NULL REFERENCES public.accounts(id),
  uploaded_by                   uuid        NOT NULL REFERENCES public.user_profiles(id),

  file_name                     text        NOT NULL,
  file_sha256                   text        NOT NULL,
  mime_type                     text        NOT NULL,
  file_size_bytes               bigint      NOT NULL,

  status                        public.file_import_status NOT NULL DEFAULT 'received',
  duplicate_of_file_import_id   uuid        NULL REFERENCES public.file_imports(id),

  institution_code              text        NULL,
  institution_id                uuid        NULL,

  statement_date                date        NULL,
  statement_period_start        date        NULL,
  statement_period_end          date        NULL,
  currency                      text        NULL,
  parse_confidence              numeric(5,4) NULL,

  raw_parse_result              jsonb       NULL,
  summary_json                  jsonb       NULL,
  card_info_json                jsonb       NULL,

  parse_error                   text        NULL,

  total_rows                    integer     NULL DEFAULT 0,
  approved_rows                 integer     NULL DEFAULT 0,
  rejected_rows                 integer     NULL DEFAULT 0,
  duplicate_rows                integer     NULL DEFAULT 0,
  committed_rows                integer     NULL DEFAULT 0,

  committed_statement_import_id uuid        NULL,
  committed_at                  timestamptz NULL,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS file_imports_household_name_sha256_uq
  ON public.file_imports (household_id, file_name, file_sha256);

CREATE INDEX IF NOT EXISTS file_imports_household_created_idx
  ON public.file_imports (household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS file_imports_account_status_idx
  ON public.file_imports (account_id, status);

ALTER TABLE public.file_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own file imports" ON public.file_imports
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own file imports" ON public.file_imports
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own file imports" ON public.file_imports
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 3. import_staging — editable parsed transaction rows before approval
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_staging (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_import_id            uuid        NOT NULL REFERENCES public.file_imports(id) ON DELETE CASCADE,
  household_id              uuid        NOT NULL REFERENCES public.households(id),
  account_id                uuid        NOT NULL REFERENCES public.accounts(id),

  row_index                 integer     NOT NULL,

  review_status             public.staging_review_status NOT NULL DEFAULT 'pending',
  duplicate_status          public.staging_duplicate_status NOT NULL DEFAULT 'none',
  duplicate_transaction_id  uuid        NULL,

  txn_hash                  text        NOT NULL,
  source_txn_hash           text        NOT NULL,

  txn_date                  date        NOT NULL,
  posting_date              date        NULL,
  merchant_raw              text        NOT NULL,
  description               text        NULL,
  reference                 text        NULL,
  amount                    numeric(14,2) NOT NULL,
  txn_type                  text        NOT NULL CHECK (txn_type IN ('debit', 'credit', 'unknown')),
  currency                  text        NOT NULL,
  original_amount           numeric(14,2) NULL,
  original_currency         text        NULL,

  confidence                numeric(5,4) NULL,

  original_data             jsonb       NOT NULL,
  is_edited                 boolean     NOT NULL DEFAULT false,

  review_note               text        NULL,
  last_reviewed_by          uuid        NULL REFERENCES public.user_profiles(id),
  last_reviewed_at          timestamptz NULL,

  committed_transaction_id  uuid        NULL,

  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (file_import_id, row_index)
);

CREATE INDEX IF NOT EXISTS import_staging_file_status_idx
  ON public.import_staging (file_import_id, review_status, row_index);

CREATE INDEX IF NOT EXISTS import_staging_file_duplicate_idx
  ON public.import_staging (file_import_id, duplicate_status);

CREATE INDEX IF NOT EXISTS import_staging_account_hash_idx
  ON public.import_staging (account_id, txn_hash);

ALTER TABLE public.import_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own staging rows" ON public.import_staging
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own staging rows" ON public.import_staging
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own staging rows" ON public.import_staging
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 4. approval_log — append-only reviewer action history
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.approval_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL REFERENCES public.households(id),
  file_import_id    uuid        NOT NULL REFERENCES public.file_imports(id) ON DELETE CASCADE,
  staging_id        uuid        NULL REFERENCES public.import_staging(id) ON DELETE CASCADE,

  actor_user_id     uuid        NOT NULL REFERENCES public.user_profiles(id),
  action            public.approval_action NOT NULL,

  old_data          jsonb       NULL,
  new_data          jsonb       NULL,
  note              text        NULL,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_log_file_created_idx
  ON public.approval_log (file_import_id, created_at DESC);

CREATE INDEX IF NOT EXISTS approval_log_staging_created_idx
  ON public.approval_log (staging_id, created_at DESC);

ALTER TABLE public.approval_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own approval logs" ON public.approval_log
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own approval logs" ON public.approval_log
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 5. Add file_import_id provenance to statement_imports
-- --------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.statement_imports ADD COLUMN file_import_id uuid NULL REFERENCES public.file_imports(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 6. Unique index on statement_transactions for final duplicate protection
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS statement_transactions_account_txn_hash_uq
  ON public.statement_transactions (account_id, txn_hash);
