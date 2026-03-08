-- ============================================================================
-- Migration: 004_receipt_ingestion_and_intelligence.sql
-- Purpose:   Add robust staged receipt ingestion, receipt-only categorization,
--            duplicate review, and receipt-to-statement linkage audit metadata.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Enums
-- --------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.receipt_upload_status AS ENUM (
    'uploaded',
    'parsing',
    'needs_review',
    'ready_for_approval',
    'committed',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.receipt_duplicate_resolution_status AS ENUM (
    'suggested',
    'user_confirmed_duplicate',
    'user_marked_distinct',
    'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.receipt_classification_source AS ENUM (
    'knowledge_base',
    'heuristic',
    'web',
    'llm',
    'user',
    'mixed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.match_actor AS ENUM ('system', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2) Receipt upload + staging tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receipt_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  uploaded_by uuid NOT NULL REFERENCES public.user_profiles(id),
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL,
  file_sha256 text NOT NULL,
  status public.receipt_upload_status NOT NULL DEFAULT 'uploaded',
  parser_version text,
  parse_started_at timestamptz,
  parse_completed_at timestamptz,
  committed_receipt_id uuid REFERENCES public.receipts(id),
  error_code text,
  error_message text,
  parse_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_uploads_household_hash_uq
  ON public.receipt_uploads (household_id, file_sha256);

CREATE INDEX IF NOT EXISTS receipt_uploads_household_status_idx
  ON public.receipt_uploads (household_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.receipt_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id),
  name text NOT NULL,
  category_family text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_categories_scope_name_uq
  ON public.receipt_categories (COALESCE(household_id::text, 'global'), lower(name));

CREATE TABLE IF NOT EXISTS public.receipt_staging_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL UNIQUE REFERENCES public.receipt_uploads(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'needs_review', 'ready', 'approved', 'committed', 'failed')),
  duplicate_status text NOT NULL DEFAULT 'none' CHECK (duplicate_status IN ('none', 'needs_review', 'resolved')),
  merchant_name text,
  txn_date date,
  payment_time time,
  transaction_total numeric(14,2),
  payment_information text,
  payment_type text,
  payment_breakdown_json jsonb,
  receipt_reference text,
  tax_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'SGD',
  notes text,
  raw_extraction_json jsonb,
  extraction_confidence numeric(5,4) CHECK (extraction_confidence IS NULL OR extraction_confidence >= 0::numeric AND extraction_confidence <= 1::numeric),
  confidence_warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  receipt_category_id uuid REFERENCES public.receipt_categories(id),
  classification_source public.receipt_classification_source,
  classification_confidence numeric(5,4) CHECK (classification_confidence IS NULL OR classification_confidence >= 0::numeric AND classification_confidence <= 1::numeric),
  classification_version text,
  is_mixed_basket boolean NOT NULL DEFAULT false,
  requires_manual_review boolean NOT NULL DEFAULT true,
  user_confirmed_low_confidence boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES public.user_profiles(id),
  reviewed_at timestamptz,
  committed_receipt_id uuid REFERENCES public.receipts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipt_staging_transactions_household_status_idx
  ON public.receipt_staging_transactions (household_id, review_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.receipt_staging_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staging_transaction_id uuid NOT NULL REFERENCES public.receipt_staging_transactions(id) ON DELETE CASCADE,
  line_number integer NOT NULL DEFAULT 1,
  item_name text,
  quantity numeric CHECK (quantity IS NULL OR quantity >= 0::numeric),
  unit_price numeric CHECK (unit_price IS NULL OR unit_price >= 0::numeric),
  line_total numeric CHECK (line_total IS NULL OR line_total >= 0::numeric),
  line_discount numeric CHECK (line_discount IS NULL OR line_discount >= 0::numeric),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_line_json jsonb,
  confidence numeric(5,4) CHECK (confidence IS NULL OR confidence >= 0::numeric AND confidence <= 1::numeric),
  receipt_category_id uuid REFERENCES public.receipt_categories(id),
  classification_source public.receipt_classification_source,
  classification_confidence numeric(5,4) CHECK (classification_confidence IS NULL OR classification_confidence >= 0::numeric AND classification_confidence <= 1::numeric),
  is_edited boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staging_transaction_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.receipt_merchant_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  merchant_id uuid REFERENCES public.merchants(id),
  normalized_merchant_name text NOT NULL,
  canonical_merchant_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  receipt_category_id uuid NOT NULL REFERENCES public.receipt_categories(id),
  confidence numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  source public.receipt_classification_source NOT NULL DEFAULT 'user',
  usage_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, normalized_merchant_name)
);

CREATE TABLE IF NOT EXISTS public.receipt_item_kb (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  normalized_item_pattern text NOT NULL,
  canonical_item_name text NOT NULL,
  receipt_category_id uuid NOT NULL REFERENCES public.receipt_categories(id),
  confidence numeric(5,4) NOT NULL DEFAULT 1 CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  source public.receipt_classification_source NOT NULL DEFAULT 'user',
  usage_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, normalized_item_pattern)
);

CREATE TABLE IF NOT EXISTS public.receipt_classification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  staging_transaction_id uuid NOT NULL REFERENCES public.receipt_staging_transactions(id) ON DELETE CASCADE,
  run_version text NOT NULL DEFAULT 'receipt-classifier-v1',
  classified_by public.receipt_classification_source NOT NULL,
  classification_confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (classification_confidence >= 0::numeric AND classification_confidence <= 1::numeric),
  model text,
  rationale text,
  web_summary text,
  input_snapshot jsonb,
  output_snapshot jsonb,
  created_by uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipt_classification_runs_staging_idx
  ON public.receipt_classification_runs (staging_transaction_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.receipt_item_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_run_id uuid NOT NULL REFERENCES public.receipt_classification_runs(id) ON DELETE CASCADE,
  staging_item_id uuid NOT NULL REFERENCES public.receipt_staging_items(id) ON DELETE CASCADE,
  receipt_category_id uuid REFERENCES public.receipt_categories(id),
  classified_by public.receipt_classification_source NOT NULL,
  confidence numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence >= 0::numeric AND confidence <= 1::numeric),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (classification_run_id, staging_item_id)
);

CREATE TABLE IF NOT EXISTS public.receipt_duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id),
  upload_id uuid NOT NULL REFERENCES public.receipt_uploads(id) ON DELETE CASCADE,
  staging_transaction_id uuid NOT NULL REFERENCES public.receipt_staging_transactions(id) ON DELETE CASCADE,
  candidate_receipt_id uuid REFERENCES public.receipts(id) ON DELETE CASCADE,
  score numeric(5,4) NOT NULL DEFAULT 0 CHECK (score >= 0::numeric AND score <= 1::numeric),
  signals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.receipt_duplicate_resolution_status NOT NULL DEFAULT 'suggested',
  reviewed_by uuid REFERENCES public.user_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staging_transaction_id, candidate_receipt_id)
);

CREATE INDEX IF NOT EXISTS receipt_duplicate_candidates_staging_status_idx
  ON public.receipt_duplicate_candidates (staging_transaction_id, status);

-- --------------------------------------------------------------------------
-- 3) Additive updates to existing receipt + mapping tables
-- --------------------------------------------------------------------------
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id),
  ADD COLUMN IF NOT EXISTS receipt_category_id uuid REFERENCES public.receipt_categories(id),
  ADD COLUMN IF NOT EXISTS receipt_reference text,
  ADD COLUMN IF NOT EXISTS payment_type text,
  ADD COLUMN IF NOT EXISTS payment_breakdown_json jsonb,
  ADD COLUMN IF NOT EXISTS raw_extraction_json jsonb,
  ADD COLUMN IF NOT EXISTS parse_warnings_json jsonb,
  ADD COLUMN IF NOT EXISTS source_upload_id uuid REFERENCES public.receipt_uploads(id),
  ADD COLUMN IF NOT EXISTS classification_source public.receipt_classification_source,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric(5,4) CHECK (classification_confidence IS NULL OR classification_confidence >= 0::numeric AND classification_confidence <= 1::numeric),
  ADD COLUMN IF NOT EXISTS classification_version text,
  ADD COLUMN IF NOT EXISTS is_mixed_basket boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS receipts_source_upload_uq
  ON public.receipts (source_upload_id)
  WHERE source_upload_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_household_created_idx
  ON public.receipts (household_id, created_at DESC);

ALTER TABLE public.receipt_items
  ADD COLUMN IF NOT EXISTS receipt_category_id uuid REFERENCES public.receipt_categories(id),
  ADD COLUMN IF NOT EXISTS line_discount numeric,
  ADD COLUMN IF NOT EXISTS line_metadata_json jsonb,
  ADD COLUMN IF NOT EXISTS classification_source public.receipt_classification_source,
  ADD COLUMN IF NOT EXISTS classification_confidence numeric(5,4) CHECK (classification_confidence IS NULL OR classification_confidence >= 0::numeric AND classification_confidence <= 1::numeric),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.mappings
  ADD COLUMN IF NOT EXISTS matched_by public.match_actor NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS matched_by_user_id uuid REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS mappings_receipt_statement_pair_uq
  ON public.mappings (statement_transaction_id, receipt_id);

-- --------------------------------------------------------------------------
-- 4) Seed receipt categories (global defaults)
-- --------------------------------------------------------------------------
INSERT INTO public.receipt_categories (household_id, name, category_family, description, sort_order)
VALUES
  (NULL, 'Groceries', 'essentials', 'Food and pantry purchases from supermarkets or grocers.', 10),
  (NULL, 'Household Supplies', 'essentials', 'Cleaning, consumables, and home-use daily supplies.', 20),
  (NULL, 'Personal Care', 'essentials', 'Personal hygiene and wellness consumables.', 30),
  (NULL, 'Dining / Food Purchase', 'lifestyle', 'Prepared food and dining-oriented purchases.', 40),
  (NULL, 'Electronics', 'durables', 'Devices and electronic accessories.', 50),
  (NULL, 'Clothing', 'lifestyle', 'Apparel and fashion items.', 60),
  (NULL, 'Home Furnishing', 'durables', 'Furniture and home decor.', 70),
  (NULL, 'Medical / Pharmacy', 'health', 'Medicine, clinic, and pharmacy-related purchases.', 80),
  (NULL, 'Kids / School', 'family', 'Children and school-related purchases.', 90),
  (NULL, 'Gifts / Flowers', 'lifestyle', 'Giftable items and flowers.', 100),
  (NULL, 'Hardware / DIY', 'durables', 'Tools, hardware, and repair supplies.', 110),
  (NULL, 'Automotive', 'transport', 'Vehicle-related purchases and supplies.', 120),
  (NULL, 'Pet Supplies', 'family', 'Food and care products for pets.', 130),
  (NULL, 'Mixed Basket', 'mixed', 'Multi-category receipts with mixed item groups.', 1000)
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- 5) RLS policies
-- --------------------------------------------------------------------------
ALTER TABLE public.receipt_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_staging_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_staging_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_merchant_kb ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_item_kb ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_classification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_item_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_duplicate_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own receipt uploads" ON public.receipt_uploads;
CREATE POLICY "Users can view own receipt uploads" ON public.receipt_uploads
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt uploads" ON public.receipt_uploads;
CREATE POLICY "Users can insert own receipt uploads" ON public.receipt_uploads
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own receipt uploads" ON public.receipt_uploads;
CREATE POLICY "Users can update own receipt uploads" ON public.receipt_uploads
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt categories" ON public.receipt_categories;
CREATE POLICY "Users can view own receipt categories" ON public.receipt_categories
  FOR SELECT USING (
    household_id IS NULL
    OR household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt categories" ON public.receipt_categories;
CREATE POLICY "Users can insert own receipt categories" ON public.receipt_categories
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own receipt categories" ON public.receipt_categories;
CREATE POLICY "Users can update own receipt categories" ON public.receipt_categories
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt staging transactions" ON public.receipt_staging_transactions;
CREATE POLICY "Users can view own receipt staging transactions" ON public.receipt_staging_transactions
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt staging transactions" ON public.receipt_staging_transactions;
CREATE POLICY "Users can insert own receipt staging transactions" ON public.receipt_staging_transactions
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own receipt staging transactions" ON public.receipt_staging_transactions;
CREATE POLICY "Users can update own receipt staging transactions" ON public.receipt_staging_transactions
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt staging items" ON public.receipt_staging_items;
CREATE POLICY "Users can view own receipt staging items" ON public.receipt_staging_items
  FOR SELECT USING (
    staging_transaction_id IN (
      SELECT id FROM public.receipt_staging_transactions
      WHERE household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert own receipt staging items" ON public.receipt_staging_items;
CREATE POLICY "Users can insert own receipt staging items" ON public.receipt_staging_items
  FOR INSERT WITH CHECK (
    staging_transaction_id IN (
      SELECT id FROM public.receipt_staging_transactions
      WHERE household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update own receipt staging items" ON public.receipt_staging_items;
CREATE POLICY "Users can update own receipt staging items" ON public.receipt_staging_items
  FOR UPDATE USING (
    staging_transaction_id IN (
      SELECT id FROM public.receipt_staging_transactions
      WHERE household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view own receipt merchant kb" ON public.receipt_merchant_kb;
CREATE POLICY "Users can view own receipt merchant kb" ON public.receipt_merchant_kb
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt merchant kb" ON public.receipt_merchant_kb;
CREATE POLICY "Users can insert own receipt merchant kb" ON public.receipt_merchant_kb
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own receipt merchant kb" ON public.receipt_merchant_kb;
CREATE POLICY "Users can update own receipt merchant kb" ON public.receipt_merchant_kb
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt item kb" ON public.receipt_item_kb;
CREATE POLICY "Users can view own receipt item kb" ON public.receipt_item_kb
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt item kb" ON public.receipt_item_kb;
CREATE POLICY "Users can insert own receipt item kb" ON public.receipt_item_kb
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own receipt item kb" ON public.receipt_item_kb;
CREATE POLICY "Users can update own receipt item kb" ON public.receipt_item_kb
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt classification runs" ON public.receipt_classification_runs;
CREATE POLICY "Users can view own receipt classification runs" ON public.receipt_classification_runs
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt classification runs" ON public.receipt_classification_runs;
CREATE POLICY "Users can insert own receipt classification runs" ON public.receipt_classification_runs
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt item classifications" ON public.receipt_item_classifications;
CREATE POLICY "Users can view own receipt item classifications" ON public.receipt_item_classifications
  FOR SELECT USING (
    classification_run_id IN (
      SELECT id FROM public.receipt_classification_runs
      WHERE household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert own receipt item classifications" ON public.receipt_item_classifications;
CREATE POLICY "Users can insert own receipt item classifications" ON public.receipt_item_classifications
  FOR INSERT WITH CHECK (
    classification_run_id IN (
      SELECT id FROM public.receipt_classification_runs
      WHERE household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view own receipt duplicate candidates" ON public.receipt_duplicate_candidates;
CREATE POLICY "Users can view own receipt duplicate candidates" ON public.receipt_duplicate_candidates
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt duplicate candidates" ON public.receipt_duplicate_candidates;
CREATE POLICY "Users can insert own receipt duplicate candidates" ON public.receipt_duplicate_candidates
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own receipt duplicate candidates" ON public.receipt_duplicate_candidates;
CREATE POLICY "Users can update own receipt duplicate candidates" ON public.receipt_duplicate_candidates
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 6) Storage bucket + policies for receipts and markdown KB
-- --------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can view own receipt storage objects" ON storage.objects;
CREATE POLICY "Users can view own receipt storage objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = 'households'
    AND split_part(name, '/', 2) IN (
      SELECT household_id::text FROM public.user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own receipt storage objects" ON storage.objects;
CREATE POLICY "Users can insert own receipt storage objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = 'households'
    AND split_part(name, '/', 2) IN (
      SELECT household_id::text FROM public.user_profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own receipt storage objects" ON storage.objects;
CREATE POLICY "Users can update own receipt storage objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND split_part(name, '/', 1) = 'households'
    AND split_part(name, '/', 2) IN (
      SELECT household_id::text FROM public.user_profiles WHERE id = auth.uid()
    )
  );
