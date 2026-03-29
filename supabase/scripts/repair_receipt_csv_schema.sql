-- ============================================================================
-- Script:    repair_receipt_csv_schema.sql
-- Purpose:   Repair environments that are missing the receipt CSV import schema
--            additions without relying on migration version ordering.
-- ============================================================================

ALTER TABLE public.receipt_uploads
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'image_upload',
  ADD COLUMN IF NOT EXISTS csv_batch_id uuid NULL;

DO $$ BEGIN
  ALTER TABLE public.receipt_uploads
    ADD CONSTRAINT receipt_uploads_import_source_check
    CHECK (import_source IN ('image_upload', 'csv_import'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS import_source text NOT NULL DEFAULT 'image_upload';

DO $$ BEGIN
  ALTER TABLE public.receipts
    ADD CONSTRAINT receipts_import_source_check
    CHECK (import_source IN ('image_upload', 'csv_import'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.receipt_csv_batches (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id      uuid        NOT NULL REFERENCES public.households(id),
  uploaded_by       uuid        NOT NULL REFERENCES public.user_profiles(id),
  storage_bucket    text        NOT NULL,
  storage_path      text        NOT NULL,
  original_filename text        NOT NULL,
  row_count         integer     NOT NULL DEFAULT 0,
  valid_count       integer     NOT NULL DEFAULT 0,
  failed_count      integer     NOT NULL DEFAULT 0,
  status            text        NOT NULL DEFAULT 'processing',
  error_message     text        NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.receipt_csv_batches
    ADD CONSTRAINT receipt_csv_batches_status_check
    CHECK (status IN ('processing', 'done', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS receipt_csv_batches_household_id_idx
  ON public.receipt_csv_batches (household_id);

DO $$ BEGIN
  ALTER TABLE public.receipt_uploads
    ADD CONSTRAINT receipt_uploads_csv_batch_fk
    FOREIGN KEY (csv_batch_id) REFERENCES public.receipt_csv_batches(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.receipt_csv_batches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY receipt_csv_batches_select ON public.receipt_csv_batches
    FOR SELECT USING (
      household_id = (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY receipt_csv_batches_insert ON public.receipt_csv_batches
    FOR INSERT WITH CHECK (
      household_id = (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY receipt_csv_batches_update ON public.receipt_csv_batches
    FOR UPDATE USING (
      household_id = (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
