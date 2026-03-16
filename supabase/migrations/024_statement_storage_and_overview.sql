-- ============================================================================
-- Migration: 024_statement_storage_and_overview.sql
-- Purpose:   Persist original statement files in Supabase storage so statement
--            overview pages can download source documents directly.
-- ============================================================================

ALTER TABLE public.file_imports
  ADD COLUMN IF NOT EXISTS storage_bucket text NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NULL;

ALTER TABLE public.statement_parse_sessions
  ADD COLUMN IF NOT EXISTS storage_bucket text NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NULL;

CREATE INDEX IF NOT EXISTS file_imports_household_status_created_idx
  ON public.file_imports (household_id, status, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('statements', 'statements', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own statement storage objects" ON storage.objects;
CREATE POLICY "Users can view own statement storage objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'statements'
    AND split_part(name, '/', 1) = 'households'
    AND split_part(name, '/', 2) IN (
      SELECT household_id::text FROM public.user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own statement storage objects" ON storage.objects;
CREATE POLICY "Users can insert own statement storage objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'statements'
    AND split_part(name, '/', 1) = 'households'
    AND split_part(name, '/', 2) IN (
      SELECT household_id::text FROM public.user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own statement storage objects" ON storage.objects;
CREATE POLICY "Users can update own statement storage objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'statements'
    AND split_part(name, '/', 1) = 'households'
    AND split_part(name, '/', 2) IN (
      SELECT household_id::text FROM public.user_profiles WHERE id = auth.uid()
    )
  );
