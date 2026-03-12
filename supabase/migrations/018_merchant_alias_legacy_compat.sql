-- ============================================================================
-- Migration: 018_merchant_alias_legacy_compat.sql
-- Purpose:   Repair legacy merchant_aliases columns (`pattern`, `source`,
--            `priority`) so canonical merchant alias inserts do not fail in
--            environments where the pre-canonical table shape still exists.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'pattern'
  ) THEN
    ALTER TABLE public.merchant_aliases
      ALTER COLUMN pattern DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.merchant_aliases
      ALTER COLUMN source DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'priority'
  ) THEN
    ALTER TABLE public.merchant_aliases
      ALTER COLUMN priority DROP NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'pattern'
  ) THEN
    UPDATE public.merchant_aliases
    SET pattern = COALESCE(pattern, raw_name, normalized_raw_name)
    WHERE pattern IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'source'
  ) THEN
    UPDATE public.merchant_aliases
    SET source = COALESCE(source, source_type, 'manual')
    WHERE source IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'priority'
  ) THEN
    UPDATE public.merchant_aliases
    SET priority = COALESCE(priority, LEAST(100, GREATEST(0, round(COALESCE(confidence, 1) * 100)::integer)))
    WHERE priority IS NULL;
  END IF;
END $$;
