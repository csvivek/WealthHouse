-- ==========================================================================
-- Migration: 003_merchant_intelligence.sql
-- Purpose:   Add merchant intelligence memory, auditability, and grocery stats
-- ==========================================================================

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS family_name text,
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS confidence numeric CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric),
  ADD COLUMN IF NOT EXISTS source_of_decision text,
  ADD COLUMN IF NOT EXISTS first_seen_date date,
  ADD COLUMN IF NOT EXISTS last_reviewed_date date,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_normalized_name_unique
  ON public.merchants (lower(normalized_name));

ALTER TABLE public.merchant_aliases
  ADD COLUMN IF NOT EXISTS normalized_pattern text,
  ADD COLUMN IF NOT EXISTS alias_type text NOT NULL DEFAULT 'explicit',
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_aliases_normalized_pattern_unique
  ON public.merchant_aliases (lower(normalized_pattern));

CREATE TABLE IF NOT EXISTS public.merchant_categorization_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  staging_id uuid REFERENCES public.import_staging(id),
  statement_transaction_id uuid REFERENCES public.statement_transactions(id),
  receipt_id uuid REFERENCES public.receipts(id),
  merchant_id uuid REFERENCES public.merchants(id),
  raw_merchant_name text NOT NULL,
  normalized_merchant_name text NOT NULL,
  canonical_merchant_name text,
  suggested_category_id bigint REFERENCES public.categories(id),
  final_category_id bigint REFERENCES public.categories(id),
  decision_source text NOT NULL CHECK (decision_source IN ('knowledge_base', 'genai_suggestion', 'manual_override', 'alias_resolution')),
  confidence numeric CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric),
  rationale text,
  business_type text,
  ambiguity_flag boolean NOT NULL DEFAULT false,
  reviewed_at timestamp with time zone,
  reviewed_by uuid REFERENCES public.user_profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_categorization_audit_household
  ON public.merchant_categorization_audit (household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_categorization_audit_staging
  ON public.merchant_categorization_audit (staging_id);

CREATE INDEX IF NOT EXISTS idx_merchant_categorization_audit_transaction
  ON public.merchant_categorization_audit (statement_transaction_id);

CREATE TABLE IF NOT EXISTS public.grocery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name text NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  taxonomy_group text NOT NULL,
  taxonomy_subgroup text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grocery_purchase_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  receipt_id uuid REFERENCES public.receipts(id),
  receipt_item_id uuid REFERENCES public.receipt_items(id),
  grocery_item_id uuid NOT NULL REFERENCES public.grocery_items(id),
  merchant_id uuid REFERENCES public.merchants(id),
  purchased_at timestamp with time zone,
  quantity numeric,
  unit_price numeric,
  line_total numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_household
  ON public.grocery_purchase_history (household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grocery_purchase_history_item
  ON public.grocery_purchase_history (grocery_item_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.grocery_item_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  grocery_item_id uuid NOT NULL REFERENCES public.grocery_items(id),
  purchase_count integer NOT NULL DEFAULT 0,
  total_quantity numeric NOT NULL DEFAULT 0,
  last_unit_price numeric,
  avg_unit_price numeric,
  last_purchased_at timestamp with time zone,
  previous_purchased_at timestamp with time zone,
  average_purchase_interval_days numeric,
  predicted_reorder_date date,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (household_id, grocery_item_id)
);
