-- ============================================================================
-- Migration: 026_institution_branding.sql
-- Purpose:   Store institution website/icon metadata for verified bank branding.
-- ============================================================================

ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS website_url text NULL,
  ADD COLUMN IF NOT EXISTS icon_url text NULL;
