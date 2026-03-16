-- ============================================================================
-- Migration: 023_statement_storage.sql
-- Purpose:   Persist uploaded statement source files in Supabase Storage and
--            link them from file_imports for later retrieval.
-- ============================================================================

ALTER TABLE public.file_imports
  ADD COLUMN IF NOT EXISTS storage_bucket text NULL,
  ADD COLUMN IF NOT EXISTS storage_path text NULL;

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
