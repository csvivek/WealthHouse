-- ============================================================================
-- Migration: 021_statement_merchant_knowledge.sql
-- Purpose:   Store statement merchant-category knowledge in Supabase instead
--            of the local application filesystem.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.statement_merchant_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  normalized_merchant_name text NOT NULL,
  canonical_merchant_name text NOT NULL,
  family_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  business_type text,
  approved_category_id bigint REFERENCES public.categories(id) ON DELETE SET NULL,
  approved_category_name text NOT NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  decision_source text NOT NULL CHECK (
    decision_source IN ('knowledge_base', 'alias_resolution', 'genai_suggestion', 'manual_override', 'web_enriched')
  ),
  usage_count integer NOT NULL DEFAULT 0,
  first_seen_date timestamptz NOT NULL DEFAULT now(),
  last_reviewed_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, normalized_merchant_name)
);

CREATE INDEX IF NOT EXISTS statement_merchant_kb_household_reviewed_idx
  ON public.statement_merchant_kb (household_id, last_reviewed_date DESC);

CREATE INDEX IF NOT EXISTS statement_merchant_kb_household_family_idx
  ON public.statement_merchant_kb (household_id, family_name);

CREATE INDEX IF NOT EXISTS statement_merchant_kb_household_category_idx
  ON public.statement_merchant_kb (household_id, approved_category_id)
  WHERE approved_category_id IS NOT NULL;

ALTER TABLE public.statement_merchant_kb ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own statement merchant kb" ON public.statement_merchant_kb;
CREATE POLICY "Users can view own statement merchant kb" ON public.statement_merchant_kb
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own statement merchant kb" ON public.statement_merchant_kb;
CREATE POLICY "Users can insert own statement merchant kb" ON public.statement_merchant_kb
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own statement merchant kb" ON public.statement_merchant_kb;
CREATE POLICY "Users can update own statement merchant kb" ON public.statement_merchant_kb
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );
