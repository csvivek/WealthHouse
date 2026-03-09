-- ============================================================================
-- Migration: 011_categories_schema_repair.sql
-- Purpose:   Repair category schema drift for environments that missed earlier
--            style/domain migrations due to split migration sources.
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
  WHEN payment_subtype IS NOT NULL THEN payment_subtype
  WHEN type IN ('income', 'expense', 'transfer') THEN type::text::public.category_payment_subtype
  ELSE NULL
END
WHERE payment_subtype IS NULL;

UPDATE public.categories
SET icon_key = COALESCE(NULLIF(icon_key, ''), 'tag'),
    color_token = COALESCE(NULLIF(color_token, ''), 'slate'),
    is_active = COALESCE(is_active, true),
    is_archived = COALESCE(is_archived, false),
    is_system = COALESCE(is_system, false);

ALTER TABLE public.categories
  ALTER COLUMN domain_type SET DEFAULT 'payment',
  ALTER COLUMN domain_type SET NOT NULL,
  ALTER COLUMN icon_key SET DEFAULT 'tag',
  ALTER COLUMN icon_key SET NOT NULL,
  ALTER COLUMN color_token SET DEFAULT 'slate',
  ALTER COLUMN color_token SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN is_archived SET DEFAULT false,
  ALTER COLUMN is_archived SET NOT NULL,
  ALTER COLUMN is_system SET DEFAULT false,
  ALTER COLUMN is_system SET NOT NULL;

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

DO $$
BEGIN
  IF to_regclass('public.categories_domain_subtype_name_ci_uq') IS NULL THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX categories_domain_subtype_name_ci_uq ON public.categories (domain_type, payment_subtype, lower(name))';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'Skipping categories_domain_subtype_name_ci_uq due to duplicate category names.';
    END;
  END IF;
END $$;

ALTER TABLE public.receipt_categories
  ADD COLUMN IF NOT EXISTS icon_key text,
  ADD COLUMN IF NOT EXISTS color_token text,
  ADD COLUMN IF NOT EXISTS color_hex text;

UPDATE public.receipt_categories
SET
  icon_key = COALESCE(NULLIF(icon_key, ''), CASE
    WHEN lower(name) ~ '(salary|payroll|bonus|income)' THEN 'salary'
    WHEN lower(name) ~ '(refund|reimbursement)' THEN 'income'
    WHEN lower(name) ~ '(transfer|xfer)' THEN 'transfer'
    WHEN lower(name) ~ '(grocery|supermarket|mart)' THEN 'groceries'
    WHEN lower(name) ~ '(food|dining|restaurant|cafe|coffee)' THEN 'food'
    WHEN lower(name) ~ '(transport|taxi|grab|uber|bus|train|mrt)' THEN 'transport'
    WHEN lower(name) ~ '(home|housing|rent|mortgage)' THEN 'home'
    WHEN lower(name) ~ '(utility|electric|water|gas|internet|phone)' THEN 'utilities'
    WHEN lower(name) ~ '(health|medical|clinic|hospital|pharmacy)' THEN 'healthcare'
    WHEN lower(name) ~ '(education|school|tuition|course)' THEN 'education'
    WHEN lower(name) ~ '(entertainment|movie|music|game|stream)' THEN 'entertainment'
    WHEN lower(name) ~ '(cash|atm|withdrawal)' THEN 'cash'
    ELSE 'tag'
  END),
  color_token = COALESCE(NULLIF(color_token, ''), CASE
    WHEN lower(name) ~ '(salary|payroll|bonus|income|refund|reimbursement)' THEN 'chart-1'
    WHEN lower(name) ~ '(grocery|supermarket|mart|food|dining|restaurant|cafe|coffee)' THEN 'chart-2'
    WHEN lower(name) ~ '(transfer|xfer|education|school|tuition|course)' THEN 'chart-3'
    WHEN lower(name) ~ '(transport|taxi|grab|uber|bus|train|mrt|utility|electric|water|gas|internet|phone|cash|atm|withdrawal)' THEN 'chart-4'
    WHEN lower(name) ~ '(home|housing|rent|mortgage|health|medical|clinic|hospital|pharmacy|entertainment|movie|music|game|stream)' THEN 'chart-5'
    ELSE 'slate'
  END);

ALTER TABLE public.receipt_categories
  ALTER COLUMN icon_key SET DEFAULT 'tag',
  ALTER COLUMN icon_key SET NOT NULL,
  ALTER COLUMN color_token SET DEFAULT 'slate',
  ALTER COLUMN color_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS receipt_staging_transactions_household_category_date_idx
  ON public.receipt_staging_transactions (household_id, receipt_category_id, txn_date DESC)
  WHERE receipt_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipt_staging_transactions_category_date_idx
  ON public.receipt_staging_transactions (receipt_category_id, txn_date DESC)
  WHERE receipt_category_id IS NOT NULL;
