-- ============================================================================
-- Migration: 013_receipt_category_overrides.sql
-- Purpose:   Add household override linkage for receipt categories
-- ============================================================================

ALTER TABLE public.receipt_categories
  ADD COLUMN IF NOT EXISTS source_category_id uuid REFERENCES public.receipt_categories(id);

CREATE INDEX IF NOT EXISTS receipt_categories_source_category_id_idx
  ON public.receipt_categories (source_category_id);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_categories_household_source_override_uq
  ON public.receipt_categories (household_id, source_category_id)
  WHERE source_category_id IS NOT NULL
    AND household_id IS NOT NULL;
