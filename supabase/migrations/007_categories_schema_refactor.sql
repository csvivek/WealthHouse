-- ============================================================================
-- Migration: 007_categories_schema_refactor.sql
-- Purpose:   Expand public.categories for domain-aware classification and
--            display metadata used by dashboard/statement/receipt experiences.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.category_domain_type AS ENUM ('receipt', 'payment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.category_payment_subtype AS ENUM ('expense', 'transfer', 'income');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS domain_type public.category_domain_type,
  ADD COLUMN IF NOT EXISTS payment_subtype public.category_payment_subtype,
  ADD COLUMN IF NOT EXISTS icon_key text,
  ADD COLUMN IF NOT EXISTS color_token text,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS is_active boolean,
  ADD COLUMN IF NOT EXISTS is_archived boolean,
  ADD COLUMN IF NOT EXISTS is_system boolean,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS display_order integer,
  ADD COLUMN IF NOT EXISTS parent_category_id integer,
  ADD COLUMN IF NOT EXISTS merged_into_category_id integer,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.categories
SET domain_type = 'payment'
WHERE domain_type IS NULL;

UPDATE public.categories
SET payment_subtype = CASE
  WHEN type IN ('income', 'expense', 'transfer') THEN type::text::public.category_payment_subtype
  ELSE payment_subtype
END
WHERE payment_subtype IS NULL;

UPDATE public.categories
SET icon_key = COALESCE(NULLIF(icon_key, ''), 'tag'),
    color_token = COALESCE(NULLIF(color_token, ''), 'slate'),
    is_active = COALESCE(is_active, true),
    is_archived = COALESCE(is_archived, false),
    is_system = COALESCE(is_system, false);

ALTER TABLE public.categories
  ALTER COLUMN domain_type SET NOT NULL,
  ALTER COLUMN domain_type SET DEFAULT 'payment',
  ALTER COLUMN icon_key SET NOT NULL,
  ALTER COLUMN icon_key SET DEFAULT 'tag',
  ALTER COLUMN color_token SET NOT NULL,
  ALTER COLUMN color_token SET DEFAULT 'slate',
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_archived SET NOT NULL,
  ALTER COLUMN is_archived SET DEFAULT false,
  ALTER COLUMN is_system SET NOT NULL,
  ALTER COLUMN is_system SET DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.categories
    ADD CONSTRAINT categories_parent_category_id_fkey
    FOREIGN KEY (parent_category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.categories
    ADD CONSTRAINT categories_merged_into_category_id_fkey
    FOREIGN KEY (merged_into_category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.categories
    ADD CONSTRAINT categories_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.categories
    ADD CONSTRAINT categories_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS categories_domain_subtype_name_ci_uq;
CREATE UNIQUE INDEX categories_domain_subtype_name_ci_uq
  ON public.categories (domain_type, COALESCE(payment_subtype::text, ''), lower(name));
