-- ============================================================================
-- Migration: 028_statement_uploads_schema_repair.sql
-- Purpose:   Repair environments where statement_uploads or its linkage
--            columns/constraints drifted out of sync with the app schema.
-- ============================================================================

-- Ensure storage columns from earlier statement storage migrations exist.
ALTER TABLE public.file_imports
  ADD COLUMN IF NOT EXISTS storage_bucket text NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NULL;

ALTER TABLE public.statement_parse_sessions
  ADD COLUMN IF NOT EXISTS storage_bucket text NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NULL;

-- Recreate the statement upload parent table if it was dropped or never
-- created, while keeping the shape compatible with the app's upload flow.
CREATE TABLE IF NOT EXISTS public.statement_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  uploaded_by uuid NOT NULL REFERENCES public.user_profiles(id),
  selected_account_id uuid NULL REFERENCES public.accounts(id),
  file_name text NOT NULL,
  file_sha256 text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL,
  storage_bucket text NULL,
  storage_path text NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'parsing', 'needs_account_resolution', 'completed', 'duplicate', 'failed')),
  duplicate_of_statement_upload_id uuid NULL REFERENCES public.statement_uploads(id),
  parse_session_id uuid NULL,
  result_payload jsonb NULL,
  error_code text NULL,
  error_message text NULL,
  parse_error text NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.statement_uploads
  ADD COLUMN IF NOT EXISTS household_id uuid,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS selected_account_id uuid NULL,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_sha256 text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS storage_bucket text NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NULL,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS duplicate_of_statement_upload_id uuid NULL,
  ADD COLUMN IF NOT EXISTS parse_session_id uuid NULL,
  ADD COLUMN IF NOT EXISTS result_payload jsonb NULL,
  ADD COLUMN IF NOT EXISTS error_code text NULL,
  ADD COLUMN IF NOT EXISTS error_message text NULL,
  ADD COLUMN IF NOT EXISTS parse_error text NULL,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.statement_uploads
SET
  status = COALESCE(NULLIF(status, ''), 'queued'),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

DO $$ BEGIN
  ALTER TABLE public.statement_uploads
    ALTER COLUMN household_id SET NOT NULL,
    ALTER COLUMN uploaded_by SET NOT NULL,
    ALTER COLUMN file_name SET NOT NULL,
    ALTER COLUMN file_sha256 SET NOT NULL,
    ALTER COLUMN mime_type SET NOT NULL,
    ALTER COLUMN file_size_bytes SET NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN status SET DEFAULT 'queued',
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now();
EXCEPTION
  WHEN invalid_table_definition THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.statement_uploads
    ADD CONSTRAINT statement_uploads_household_id_fkey
    FOREIGN KEY (household_id) REFERENCES public.households(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.statement_uploads
    ADD CONSTRAINT statement_uploads_uploaded_by_fkey
    FOREIGN KEY (uploaded_by) REFERENCES public.user_profiles(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.statement_uploads
    ADD CONSTRAINT statement_uploads_selected_account_id_fkey
    FOREIGN KEY (selected_account_id) REFERENCES public.accounts(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.statement_uploads
    ADD CONSTRAINT statement_uploads_duplicate_of_statement_upload_id_fkey
    FOREIGN KEY (duplicate_of_statement_upload_id) REFERENCES public.statement_uploads(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.statement_uploads
    DROP CONSTRAINT IF EXISTS statement_uploads_status_check;
  ALTER TABLE public.statement_uploads
    ADD CONSTRAINT statement_uploads_status_check
    CHECK (status IN ('queued', 'parsing', 'needs_account_resolution', 'completed', 'duplicate', 'failed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS statement_uploads_household_status_created_idx
  ON public.statement_uploads (household_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS statement_uploads_household_sha256_uq
  ON public.statement_uploads (household_id, file_sha256);

ALTER TABLE public.statement_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own statement uploads" ON public.statement_uploads;
CREATE POLICY "Users can view own statement uploads" ON public.statement_uploads
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own statement uploads" ON public.statement_uploads;
CREATE POLICY "Users can insert own statement uploads" ON public.statement_uploads
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own statement uploads" ON public.statement_uploads;
CREATE POLICY "Users can update own statement uploads" ON public.statement_uploads
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

ALTER TABLE public.file_imports
  ADD COLUMN IF NOT EXISTS statement_upload_id uuid NULL;

DO $$ BEGIN
  ALTER TABLE public.file_imports
    ADD CONSTRAINT file_imports_statement_upload_id_fkey
    FOREIGN KEY (statement_upload_id) REFERENCES public.statement_uploads(id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS file_imports_statement_upload_idx
  ON public.file_imports (statement_upload_id, created_at DESC);

ALTER TABLE public.statement_parse_sessions
  ADD COLUMN IF NOT EXISTS statement_upload_id uuid NULL,
  ADD COLUMN IF NOT EXISTS resolution_payload jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.statement_parse_sessions
    ADD CONSTRAINT statement_parse_sessions_statement_upload_id_fkey
    FOREIGN KEY (statement_upload_id)
    REFERENCES public.statement_uploads(id)
    ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS statement_parse_sessions_upload_idx
  ON public.statement_parse_sessions (statement_upload_id, status, created_at DESC);

WITH representative_imports AS (
  SELECT DISTINCT ON (household_id, file_sha256)
    household_id,
    file_sha256,
    id,
    uploaded_by,
    account_id,
    file_name,
    mime_type,
    file_size_bytes,
    storage_bucket,
    storage_path,
    status,
    parse_error,
    created_at,
    updated_at
  FROM public.file_imports
  WHERE file_sha256 IS NOT NULL
  ORDER BY
    household_id,
    file_sha256,
    CASE WHEN status = 'duplicate' THEN 1 ELSE 0 END,
    created_at ASC,
    id ASC
)
INSERT INTO public.statement_uploads (
  id,
  household_id,
  uploaded_by,
  selected_account_id,
  file_name,
  file_sha256,
  mime_type,
  file_size_bytes,
  storage_bucket,
  storage_path,
  status,
  parse_error,
  completed_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  representative_imports.household_id,
  representative_imports.uploaded_by,
  representative_imports.account_id,
  representative_imports.file_name,
  representative_imports.file_sha256,
  representative_imports.mime_type,
  representative_imports.file_size_bytes,
  representative_imports.storage_bucket,
  representative_imports.storage_path,
  CASE
    WHEN representative_imports.status = 'failed' THEN 'failed'
    WHEN representative_imports.status = 'duplicate' THEN 'duplicate'
    ELSE 'completed'
  END,
  representative_imports.parse_error,
  CASE
    WHEN representative_imports.status IN ('in_review', 'committed', 'rejected', 'duplicate') THEN representative_imports.updated_at
    ELSE NULL
  END,
  representative_imports.created_at,
  representative_imports.updated_at
FROM representative_imports
ON CONFLICT (household_id, file_sha256) DO NOTHING;

UPDATE public.file_imports AS file_imports
SET statement_upload_id = statement_uploads.id
FROM public.statement_uploads AS statement_uploads
WHERE file_imports.statement_upload_id IS NULL
  AND statement_uploads.household_id = file_imports.household_id
  AND statement_uploads.file_sha256 = file_imports.file_sha256;

UPDATE public.statement_uploads AS statement_uploads
SET duplicate_of_statement_upload_id = target_upload.id
FROM public.file_imports AS duplicate_import
JOIN public.file_imports AS original_import
  ON original_import.id = duplicate_import.duplicate_of_file_import_id
JOIN public.statement_uploads AS target_upload
  ON target_upload.household_id = original_import.household_id
  AND target_upload.file_sha256 = original_import.file_sha256
WHERE statement_uploads.household_id = duplicate_import.household_id
  AND statement_uploads.file_sha256 = duplicate_import.file_sha256
  AND duplicate_import.duplicate_of_file_import_id IS NOT NULL
  AND statement_uploads.duplicate_of_statement_upload_id IS NULL;

ALTER TABLE public.statement_uploads
  DROP CONSTRAINT IF EXISTS statement_uploads_parse_session_id_fkey;

ALTER TABLE public.statement_uploads
  ADD CONSTRAINT statement_uploads_parse_session_id_fkey
  FOREIGN KEY (parse_session_id)
  REFERENCES public.statement_parse_sessions(id)
  ON DELETE SET NULL;

DROP INDEX IF EXISTS file_imports_household_name_sha256_uq;
