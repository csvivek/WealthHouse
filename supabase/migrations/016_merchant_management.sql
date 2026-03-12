-- ============================================================================
-- Migration: 016_merchant_management.sql
-- Purpose:   Repair and formalize canonical merchant management with
--            household-scoped merchants, aliases, safe merge/delete helpers,
--            and merchant link repair for committed transactions/receipts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text,
  icon_key text NOT NULL DEFAULT 'store',
  color_token text NOT NULL DEFAULT 'slate',
  color_hex text,
  notes text,
  default_category_id bigint REFERENCES public.categories(id) ON DELETE SET NULL,
  merged_into_merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS normalized_name text,
  ADD COLUMN IF NOT EXISTS icon_key text,
  ADD COLUMN IF NOT EXISTS color_token text,
  ADD COLUMN IF NOT EXISTS color_hex text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS merged_into_merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active boolean,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.merchants
SET
  normalized_name = COALESCE(NULLIF(normalized_name, ''), lower(regexp_replace(name, '[^a-zA-Z0-9]+', ' ', 'g'))),
  icon_key = COALESCE(NULLIF(icon_key, ''), 'store'),
  color_token = COALESCE(NULLIF(color_token, ''), 'slate'),
  is_active = COALESCE(is_active, true),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE normalized_name IS NULL
   OR icon_key IS NULL
   OR color_token IS NULL
   OR is_active IS NULL
   OR updated_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'statement_transactions' AND column_name = 'merchant_id'
  ) THEN
    UPDATE public.merchants m
    SET household_id = scope.household_id
    FROM (
      SELECT st.merchant_id, (array_agg(DISTINCT a.household_id))[1] AS household_id
      FROM public.statement_transactions st
      JOIN public.accounts a ON a.id = st.account_id
      WHERE st.merchant_id IS NOT NULL
      GROUP BY st.merchant_id
      HAVING count(DISTINCT a.household_id) = 1
    ) AS scope
    WHERE m.id = scope.merchant_id
      AND m.household_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'receipts' AND column_name = 'merchant_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'receipts' AND column_name = 'household_id'
  ) THEN
    UPDATE public.merchants m
    SET household_id = scope.household_id
    FROM (
      SELECT r.merchant_id, (array_agg(DISTINCT r.household_id))[1] AS household_id
      FROM public.receipts r
      WHERE r.merchant_id IS NOT NULL
        AND r.household_id IS NOT NULL
      GROUP BY r.merchant_id
      HAVING count(DISTINCT r.household_id) = 1
    ) AS scope
    WHERE m.id = scope.merchant_id
      AND m.household_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.merchants
  ALTER COLUMN icon_key SET DEFAULT 'store',
  ALTER COLUMN icon_key SET NOT NULL,
  ALTER COLUMN color_token SET DEFAULT 'slate',
  ALTER COLUMN color_token SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.merchant_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  raw_name text,
  normalized_raw_name text,
  source_type text NOT NULL DEFAULT 'manual',
  confidence numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.merchant_aliases
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS raw_name text,
  ADD COLUMN IF NOT EXISTS normalized_raw_name text,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS confidence numeric(5,4),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'pattern'
  ) THEN
    UPDATE public.merchant_aliases
    SET raw_name = COALESCE(NULLIF(raw_name, ''), pattern)
    WHERE raw_name IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'source'
  ) THEN
    UPDATE public.merchant_aliases
    SET source_type = COALESCE(NULLIF(source_type, ''), source)
    WHERE source_type IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_aliases' AND column_name = 'priority'
  ) THEN
    UPDATE public.merchant_aliases
    SET confidence = COALESCE(confidence, LEAST(1, GREATEST(0, priority::numeric / 100)))
    WHERE confidence IS NULL AND priority IS NOT NULL;
  END IF;
END $$;

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

UPDATE public.merchant_aliases ma
SET
  normalized_raw_name = COALESCE(NULLIF(ma.normalized_raw_name, ''), lower(regexp_replace(COALESCE(ma.raw_name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))),
  household_id = COALESCE(ma.household_id, m.household_id),
  source_type = COALESCE(NULLIF(ma.source_type, ''), 'manual'),
  updated_at = COALESCE(ma.updated_at, ma.created_at, now())
FROM public.merchants m
WHERE ma.merchant_id = m.id
  AND (
    ma.normalized_raw_name IS NULL
    OR ma.household_id IS NULL
    OR ma.source_type IS NULL
    OR ma.updated_at IS NULL
  );

ALTER TABLE public.merchant_aliases
  ALTER COLUMN source_type SET DEFAULT 'manual',
  ALTER COLUMN source_type SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'statement_transactions'
  ) THEN
    ALTER TABLE public.statement_transactions
      ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'receipts'
  ) THEN
    ALTER TABLE public.receipts
      ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ledger_entries'
  ) THEN
    ALTER TABLE public.ledger_entries
      ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES public.merchants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS merchants_household_active_name_idx
  ON public.merchants (household_id, is_active, lower(name));

CREATE INDEX IF NOT EXISTS merchants_household_normalized_idx
  ON public.merchants (household_id, lower(normalized_name));

DO $$
BEGIN
  IF to_regclass('public.merchants_household_normalized_active_uq') IS NULL THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX merchants_household_normalized_active_uq
        ON public.merchants (household_id, lower(normalized_name))
        WHERE household_id IS NOT NULL AND is_active = true AND merged_into_merchant_id IS NULL';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'Skipping merchants_household_normalized_active_uq due to duplicate normalized merchant names.';
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS merchant_aliases_household_merchant_idx
  ON public.merchant_aliases (household_id, merchant_id);

CREATE INDEX IF NOT EXISTS merchant_aliases_household_normalized_idx
  ON public.merchant_aliases (household_id, lower(normalized_raw_name));

DO $$
BEGIN
  IF to_regclass('public.merchant_aliases_household_normalized_uq') IS NULL THEN
    BEGIN
      EXECUTE 'CREATE UNIQUE INDEX merchant_aliases_household_normalized_uq
        ON public.merchant_aliases (household_id, lower(normalized_raw_name))
        WHERE household_id IS NOT NULL AND normalized_raw_name IS NOT NULL';
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'Skipping merchant_aliases_household_normalized_uq due to duplicate normalized alias values.';
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS statement_transactions_merchant_id_idx
  ON public.statement_transactions (merchant_id)
  WHERE merchant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_merchant_id_idx
  ON public.receipts (merchant_id)
  WHERE merchant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ledger_entries_merchant_id_idx
  ON public.ledger_entries (merchant_id)
  WHERE merchant_id IS NOT NULL;

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own merchants" ON public.merchants;
CREATE POLICY "Users can view own merchants" ON public.merchants
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own merchants" ON public.merchants;
CREATE POLICY "Users can manage own merchants" ON public.merchants
  FOR ALL USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own merchant aliases" ON public.merchant_aliases;
CREATE POLICY "Users can view own merchant aliases" ON public.merchant_aliases
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own merchant aliases" ON public.merchant_aliases;
CREATE POLICY "Users can manage own merchant aliases" ON public.merchant_aliases
  FOR ALL USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP TRIGGER IF EXISTS merchants_set_updated_at ON public.merchants;
CREATE TRIGGER merchants_set_updated_at
BEFORE UPDATE ON public.merchants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS merchant_aliases_set_updated_at ON public.merchant_aliases;
CREATE TRIGGER merchant_aliases_set_updated_at
BEFORE UPDATE ON public.merchant_aliases
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.merchant_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  victim_merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  survivor_merchant_id uuid NOT NULL REFERENCES public.merchants(id),
  moved_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES public.user_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_merge_audit_victim_idx
  ON public.merchant_merge_audit (victim_merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_merge_audit_survivor_idx
  ON public.merchant_merge_audit (survivor_merchant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.merchant_reference_impact(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_aliases bigint := 0;
  v_statement_transactions bigint := 0;
  v_receipts bigint := 0;
  v_ledger_entries bigint := 0;
  v_receipt_kb bigint := 0;
  v_categorization_audits bigint := 0;
  v_grocery_purchases bigint := 0;
BEGIN
  SELECT count(*) INTO v_aliases
  FROM public.merchant_aliases
  WHERE merchant_id = p_merchant_id;

  IF to_regclass('public.statement_transactions') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.statement_transactions WHERE merchant_id = $1'
      INTO v_statement_transactions
      USING p_merchant_id;
  END IF;

  IF to_regclass('public.receipts') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.receipts WHERE merchant_id = $1'
      INTO v_receipts
      USING p_merchant_id;
  END IF;

  IF to_regclass('public.ledger_entries') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.ledger_entries WHERE merchant_id = $1'
      INTO v_ledger_entries
      USING p_merchant_id;
  END IF;

  IF to_regclass('public.receipt_merchant_kb') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.receipt_merchant_kb WHERE merchant_id = $1'
      INTO v_receipt_kb
      USING p_merchant_id;
  END IF;

  IF to_regclass('public.merchant_categorization_audit') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.merchant_categorization_audit WHERE merchant_id = $1'
      INTO v_categorization_audits
      USING p_merchant_id;
  END IF;

  IF to_regclass('public.grocery_purchase_history') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.grocery_purchase_history WHERE merchant_id = $1'
      INTO v_grocery_purchases
      USING p_merchant_id;
  END IF;

  RETURN jsonb_build_object(
    'aliases', v_aliases,
    'statementTransactions', v_statement_transactions,
    'receipts', v_receipts,
    'ledgerEntries', v_ledger_entries,
    'receiptKnowledge', v_receipt_kb,
    'categorizationAudits', v_categorization_audits,
    'groceryPurchases', v_grocery_purchases,
    'total',
      v_aliases + v_statement_transactions + v_receipts + v_ledger_entries + v_receipt_kb + v_categorization_audits + v_grocery_purchases
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merchant_merge_preview(p_victim_id uuid, p_survivor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_victim public.merchants%ROWTYPE;
  v_survivor public.merchants%ROWTYPE;
BEGIN
  IF p_victim_id = p_survivor_id THEN
    RAISE EXCEPTION 'Victim and survivor merchants must be different';
  END IF;

  SELECT * INTO v_victim FROM public.merchants WHERE id = p_victim_id;
  IF v_victim.id IS NULL THEN
    RAISE EXCEPTION 'Victim merchant not found';
  END IF;

  SELECT * INTO v_survivor FROM public.merchants WHERE id = p_survivor_id;
  IF v_survivor.id IS NULL THEN
    RAISE EXCEPTION 'Survivor merchant not found';
  END IF;

  IF v_victim.household_id IS NOT NULL
     AND v_survivor.household_id IS NOT NULL
     AND v_victim.household_id <> v_survivor.household_id THEN
    RAISE EXCEPTION 'Merchants are not merge-compatible: household mismatch';
  END IF;

  RETURN jsonb_build_object(
    'victimId', p_victim_id,
    'survivorId', p_survivor_id,
    'impact', public.merchant_reference_impact(p_victim_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_merchant_safe(
  p_victim_id uuid,
  p_survivor_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_victim public.merchants%ROWTYPE;
  v_survivor public.merchants%ROWTYPE;
  v_impact_before jsonb;
  v_moved_aliases bigint := 0;
  v_moved_statement_transactions bigint := 0;
  v_moved_receipts bigint := 0;
  v_moved_ledger_entries bigint := 0;
  v_moved_receipt_kb bigint := 0;
  v_moved_categorization_audits bigint := 0;
  v_moved_grocery_purchases bigint := 0;
BEGIN
  IF p_victim_id = p_survivor_id THEN
    RAISE EXCEPTION 'Victim and survivor merchants must be different';
  END IF;

  SELECT * INTO v_victim FROM public.merchants WHERE id = p_victim_id;
  IF v_victim.id IS NULL THEN
    RAISE EXCEPTION 'Victim merchant not found';
  END IF;

  SELECT * INTO v_survivor FROM public.merchants WHERE id = p_survivor_id;
  IF v_survivor.id IS NULL THEN
    RAISE EXCEPTION 'Survivor merchant not found';
  END IF;

  IF v_victim.household_id IS NOT NULL
     AND v_survivor.household_id IS NOT NULL
     AND v_victim.household_id <> v_survivor.household_id THEN
    RAISE EXCEPTION 'Merchants are not merge-compatible: household mismatch';
  END IF;

  v_impact_before := public.merchant_reference_impact(p_victim_id);

  DELETE FROM public.merchant_aliases victim_alias
  USING public.merchant_aliases survivor_alias
  WHERE victim_alias.merchant_id = p_victim_id
    AND survivor_alias.merchant_id = p_survivor_id
    AND victim_alias.household_id IS NOT DISTINCT FROM survivor_alias.household_id
    AND lower(COALESCE(victim_alias.normalized_raw_name, '')) = lower(COALESCE(survivor_alias.normalized_raw_name, ''));

  UPDATE public.merchant_aliases
  SET merchant_id = p_survivor_id,
      household_id = COALESCE(household_id, v_survivor.household_id)
  WHERE merchant_id = p_victim_id;
  GET DIAGNOSTICS v_moved_aliases = ROW_COUNT;

  IF to_regclass('public.statement_transactions') IS NOT NULL THEN
    EXECUTE 'UPDATE public.statement_transactions SET merchant_id = $1 WHERE merchant_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_statement_transactions = ROW_COUNT;
  END IF;

  IF to_regclass('public.receipts') IS NOT NULL THEN
    EXECUTE 'UPDATE public.receipts SET merchant_id = $1 WHERE merchant_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_receipts = ROW_COUNT;
  END IF;

  IF to_regclass('public.ledger_entries') IS NOT NULL THEN
    EXECUTE 'UPDATE public.ledger_entries
             SET merchant_id = $1,
                 merchant_display = COALESCE(merchant_display, $3)
             WHERE merchant_id = $2'
      USING p_survivor_id, p_victim_id, v_survivor.name;
    GET DIAGNOSTICS v_moved_ledger_entries = ROW_COUNT;
  END IF;

  IF to_regclass('public.receipt_merchant_kb') IS NOT NULL THEN
    EXECUTE 'UPDATE public.receipt_merchant_kb SET merchant_id = $1 WHERE merchant_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_receipt_kb = ROW_COUNT;
  END IF;

  IF to_regclass('public.merchant_categorization_audit') IS NOT NULL THEN
    EXECUTE 'UPDATE public.merchant_categorization_audit SET merchant_id = $1 WHERE merchant_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_categorization_audits = ROW_COUNT;
  END IF;

  IF to_regclass('public.grocery_purchase_history') IS NOT NULL THEN
    EXECUTE 'UPDATE public.grocery_purchase_history SET merchant_id = $1 WHERE merchant_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_grocery_purchases = ROW_COUNT;
  END IF;

  UPDATE public.merchants
  SET is_active = false,
      merged_into_merchant_id = p_survivor_id,
      updated_by = COALESCE(p_actor_user_id, updated_by)
  WHERE id = p_victim_id;

  INSERT INTO public.merchant_merge_audit (
    victim_merchant_id,
    survivor_merchant_id,
    moved_counts,
    actor_user_id
  ) VALUES (
    p_victim_id,
    p_survivor_id,
    jsonb_build_object(
      'aliases', v_moved_aliases,
      'statementTransactions', v_moved_statement_transactions,
      'receipts', v_moved_receipts,
      'ledgerEntries', v_moved_ledger_entries,
      'receiptKnowledge', v_moved_receipt_kb,
      'categorizationAudits', v_moved_categorization_audits,
      'groceryPurchases', v_moved_grocery_purchases,
      'total',
        v_moved_aliases + v_moved_statement_transactions + v_moved_receipts + v_moved_ledger_entries + v_moved_receipt_kb + v_moved_categorization_audits + v_moved_grocery_purchases
    ),
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'victimId', p_victim_id,
    'survivorId', p_survivor_id,
    'impactBefore', v_impact_before,
    'moved', jsonb_build_object(
      'aliases', v_moved_aliases,
      'statementTransactions', v_moved_statement_transactions,
      'receipts', v_moved_receipts,
      'ledgerEntries', v_moved_ledger_entries,
      'receiptKnowledge', v_moved_receipt_kb,
      'categorizationAudits', v_moved_categorization_audits,
      'groceryPurchases', v_moved_grocery_purchases,
      'total',
        v_moved_aliases + v_moved_statement_transactions + v_moved_receipts + v_moved_ledger_entries + v_moved_receipt_kb + v_moved_categorization_audits + v_moved_grocery_purchases
    ),
    'impactAfterVictim', public.merchant_reference_impact(p_victim_id),
    'impactAfterSurvivor', public.merchant_reference_impact(p_survivor_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_merchant_safe(p_merchant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_impact jsonb;
  v_total bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.merchants WHERE id = p_merchant_id
  ) THEN
    RAISE EXCEPTION 'Merchant not found';
  END IF;

  v_impact := public.merchant_reference_impact(p_merchant_id);
  v_total := COALESCE((v_impact ->> 'total')::bigint, 0);

  IF v_total > 0 THEN
    RETURN jsonb_build_object(
      'merchantId', p_merchant_id,
      'deleted', false,
      'blocked', true,
      'impact', v_impact
    );
  END IF;

  DELETE FROM public.merchants WHERE id = p_merchant_id;

  RETURN jsonb_build_object(
    'merchantId', p_merchant_id,
    'deleted', true,
    'blocked', false,
    'impact', v_impact
  );
END;
$$;
