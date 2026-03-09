-- ==========================================================================
-- Migration: 006_category_merge_delete_safety.sql
-- Purpose:   Safe category merge + guarded delete with impact summaries/audit
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.category_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  victim_category_id bigint NOT NULL REFERENCES public.categories(id),
  survivor_category_id bigint NOT NULL REFERENCES public.categories(id),
  moved_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES public.user_profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_merge_audit_victim
  ON public.category_merge_audit (victim_category_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_category_merge_audit_survivor
  ON public.category_merge_audit (survivor_category_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.category_reference_impact(p_category_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_statement_transactions bigint := 0;
  v_ledger_entries bigint := 0;
  v_receipt_items bigint := 0;
  v_merchant_defaults bigint := 0;
  v_merchant_mapping bigint := 0;
  v_receipt_mapping bigint := 0;
  v_rules bigint := 0;
BEGIN
  SELECT count(*) INTO v_statement_transactions
  FROM public.statement_transactions
  WHERE category_id = p_category_id;

  SELECT count(*) INTO v_ledger_entries
  FROM public.ledger_entries
  WHERE category_id = p_category_id;

  SELECT count(*) INTO v_receipt_items
  FROM public.receipt_items
  WHERE category_id = p_category_id;

  SELECT count(*) INTO v_merchant_defaults
  FROM public.merchants
  WHERE default_category_id = p_category_id;

  IF to_regclass('public.merchant_category_mappings') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.merchant_category_mappings WHERE category_id = $1'
      INTO v_merchant_mapping
      USING p_category_id;
  END IF;

  IF to_regclass('public.receipt_category_mappings') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.receipt_category_mappings WHERE category_id = $1'
      INTO v_receipt_mapping
      USING p_category_id;
  END IF;

  IF to_regclass('public.category_rules') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.category_rules WHERE category_id = $1'
      INTO v_rules
      USING p_category_id;
  END IF;

  RETURN jsonb_build_object(
    'statementTransactions', v_statement_transactions,
    'ledgerEntries', v_ledger_entries,
    'receiptItems', v_receipt_items,
    'merchantDefaults', v_merchant_defaults,
    'merchantMappings', v_merchant_mapping,
    'receiptMappings', v_receipt_mapping,
    'rules', v_rules,
    'total', v_statement_transactions + v_ledger_entries + v_receipt_items + v_merchant_defaults + v_merchant_mapping + v_receipt_mapping + v_rules
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.category_merge_preview(p_victim_id bigint, p_survivor_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_victim public.categories%ROWTYPE;
  v_survivor public.categories%ROWTYPE;
BEGIN
  IF p_victim_id = p_survivor_id THEN
    RAISE EXCEPTION 'Victim and survivor categories must be different';
  END IF;

  SELECT * INTO v_victim FROM public.categories WHERE id = p_victim_id;
  SELECT * INTO v_survivor FROM public.categories WHERE id = p_survivor_id;

  IF NOT FOUND OR v_victim.id IS NULL OR v_survivor.id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  IF v_victim.type IS NOT NULL AND v_survivor.type IS NOT NULL AND v_victim.type <> v_survivor.type THEN
    RAISE EXCEPTION 'Categories are not merge-compatible: type mismatch';
  END IF;

  IF v_victim.group_name IS NOT NULL AND v_survivor.group_name IS NOT NULL AND lower(v_victim.group_name) <> lower(v_survivor.group_name) THEN
    RAISE EXCEPTION 'Categories are not merge-compatible: group_name mismatch';
  END IF;

  RETURN jsonb_build_object(
    'victimId', p_victim_id,
    'survivorId', p_survivor_id,
    'impact', public.category_reference_impact(p_victim_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_category_safe(
  p_victim_id bigint,
  p_survivor_id bigint,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_victim public.categories%ROWTYPE;
  v_survivor public.categories%ROWTYPE;
  v_impact_before jsonb;
  v_moved_statement_transactions bigint := 0;
  v_moved_ledger_entries bigint := 0;
  v_moved_receipt_items bigint := 0;
  v_moved_merchant_defaults bigint := 0;
  v_moved_merchant_mapping bigint := 0;
  v_moved_receipt_mapping bigint := 0;
  v_moved_rules bigint := 0;
  v_moved_total bigint := 0;
BEGIN
  IF p_victim_id = p_survivor_id THEN
    RAISE EXCEPTION 'Victim and survivor categories must be different';
  END IF;

  SELECT * INTO v_victim FROM public.categories WHERE id = p_victim_id;
  IF v_victim.id IS NULL THEN
    RAISE EXCEPTION 'Victim category not found';
  END IF;

  SELECT * INTO v_survivor FROM public.categories WHERE id = p_survivor_id;
  IF v_survivor.id IS NULL THEN
    RAISE EXCEPTION 'Survivor category not found';
  END IF;

  IF v_victim.type IS NOT NULL AND v_survivor.type IS NOT NULL AND v_victim.type <> v_survivor.type THEN
    RAISE EXCEPTION 'Categories are not merge-compatible: type mismatch';
  END IF;

  IF v_victim.group_name IS NOT NULL AND v_survivor.group_name IS NOT NULL AND lower(v_victim.group_name) <> lower(v_survivor.group_name) THEN
    RAISE EXCEPTION 'Categories are not merge-compatible: group_name mismatch';
  END IF;

  v_impact_before := public.category_reference_impact(p_victim_id);

  UPDATE public.statement_transactions
  SET category_id = p_survivor_id
  WHERE category_id = p_victim_id;
  GET DIAGNOSTICS v_moved_statement_transactions = ROW_COUNT;

  UPDATE public.ledger_entries
  SET category_id = p_survivor_id
  WHERE category_id = p_victim_id;
  GET DIAGNOSTICS v_moved_ledger_entries = ROW_COUNT;

  UPDATE public.receipt_items
  SET category_id = p_survivor_id
  WHERE category_id = p_victim_id;
  GET DIAGNOSTICS v_moved_receipt_items = ROW_COUNT;

  UPDATE public.merchants
  SET default_category_id = p_survivor_id
  WHERE default_category_id = p_victim_id;
  GET DIAGNOSTICS v_moved_merchant_defaults = ROW_COUNT;

  IF to_regclass('public.merchant_category_mappings') IS NOT NULL THEN
    EXECUTE 'UPDATE public.merchant_category_mappings SET category_id = $1 WHERE category_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_merchant_mapping = ROW_COUNT;
  END IF;

  IF to_regclass('public.receipt_category_mappings') IS NOT NULL THEN
    EXECUTE 'UPDATE public.receipt_category_mappings SET category_id = $1 WHERE category_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_receipt_mapping = ROW_COUNT;
  END IF;

  IF to_regclass('public.category_rules') IS NOT NULL THEN
    EXECUTE 'UPDATE public.category_rules SET category_id = $1 WHERE category_id = $2'
      USING p_survivor_id, p_victim_id;
    GET DIAGNOSTICS v_moved_rules = ROW_COUNT;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'is_active'
  ) THEN
    EXECUTE 'UPDATE public.categories SET is_active = false WHERE id = $1' USING p_victim_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'merged_into_category_id'
  ) THEN
    EXECUTE 'UPDATE public.categories SET merged_into_category_id = $1 WHERE id = $2' USING p_survivor_id, p_victim_id;
  END IF;

  v_moved_total := v_moved_statement_transactions + v_moved_ledger_entries + v_moved_receipt_items + v_moved_merchant_defaults + v_moved_merchant_mapping + v_moved_receipt_mapping + v_moved_rules;

  INSERT INTO public.category_merge_audit (
    victim_category_id,
    survivor_category_id,
    moved_counts,
    actor_user_id
  ) VALUES (
    p_victim_id,
    p_survivor_id,
    jsonb_build_object(
      'statementTransactions', v_moved_statement_transactions,
      'ledgerEntries', v_moved_ledger_entries,
      'receiptItems', v_moved_receipt_items,
      'merchantDefaults', v_moved_merchant_defaults,
      'merchantMappings', v_moved_merchant_mapping,
      'receiptMappings', v_moved_receipt_mapping,
      'rules', v_moved_rules,
      'total', v_moved_total
    ),
    p_actor_user_id
  );

  RETURN jsonb_build_object(
    'victimId', p_victim_id,
    'survivorId', p_survivor_id,
    'impactBefore', v_impact_before,
    'moved', jsonb_build_object(
      'statementTransactions', v_moved_statement_transactions,
      'ledgerEntries', v_moved_ledger_entries,
      'receiptItems', v_moved_receipt_items,
      'merchantDefaults', v_moved_merchant_defaults,
      'merchantMappings', v_moved_merchant_mapping,
      'receiptMappings', v_moved_receipt_mapping,
      'rules', v_moved_rules,
      'total', v_moved_total
    ),
    'impactAfterVictim', public.category_reference_impact(p_victim_id),
    'impactAfterSurvivor', public.category_reference_impact(p_survivor_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_category_safe(p_category_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_impact jsonb;
  v_total bigint;
BEGIN
  v_impact := public.category_reference_impact(p_category_id);
  v_total := COALESCE((v_impact ->> 'total')::bigint, 0);

  IF v_total > 0 THEN
    RETURN jsonb_build_object(
      'categoryId', p_category_id,
      'deleted', false,
      'blocked', true,
      'impact', v_impact
    );
  END IF;

  DELETE FROM public.categories WHERE id = p_category_id;

  RETURN jsonb_build_object(
    'categoryId', p_category_id,
    'deleted', true,
    'blocked', false,
    'impact', v_impact
  );
END;
$$;
