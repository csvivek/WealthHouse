-- ============================================================================
-- One-off cleanup: remove imported statement and receipt data while preserving
-- categories, tags, merchants, aliases, and merchant/category knowledge bases.
-- Safe to run multiple times. The transaction aborts if preserved tables change
-- or if any required cleanup validation fails.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE cleanup_counts (
  phase text NOT NULL CHECK (phase IN ('before', 'after')),
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  PRIMARY KEY (phase, table_name)
);

CREATE TEMP TABLE cleanup_validations (
  validation_name text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('pass', 'fail')),
  details text NOT NULL
);

CREATE OR REPLACE FUNCTION pg_temp.capture_count(p_table_name text, p_phase text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_qualified text := format('public.%I', p_table_name);
  v_count bigint := 0;
BEGIN
  IF to_regclass(v_qualified) IS NOT NULL THEN
    EXECUTE format('SELECT count(*) FROM %s', v_qualified) INTO v_count;
  END IF;

  INSERT INTO cleanup_counts (phase, table_name, row_count)
  VALUES (p_phase, p_table_name, v_count)
  ON CONFLICT (phase, table_name)
  DO UPDATE SET row_count = EXCLUDED.row_count;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.column_exists(p_table_name text, p_column_name text)
RETURNS boolean
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.delete_all_if_exists(p_table_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_qualified text := format('public.%I', p_table_name);
BEGIN
  IF to_regclass(v_qualified) IS NOT NULL THEN
    EXECUTE format('DELETE FROM %s', v_qualified);
  END IF;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'statement_transactions',
    'statement_transaction_tags',
    'statement_imports',
    'statement_summaries',
    'file_imports',
    'import_staging',
    'approval_log',
    'staging_transaction_links',
    'statement_uploads',
    'statement_parse_sessions',
    'receipts',
    'receipt_tags',
    'receipt_items',
    'receipt_uploads',
    'receipt_staging_transactions',
    'receipt_staging_items',
    'receipt_duplicate_candidates',
    'receipt_classification_runs',
    'receipt_item_classifications',
    'mappings',
    'transaction_links',
    'merchant_categorization_audit',
    'grocery_purchase_history',
    'grocery_item_summaries',
    'categories',
    'receipt_categories',
    'tags',
    'merchants',
    'merchant_aliases',
    'statement_merchant_kb',
    'receipt_merchant_kb',
    'receipt_item_kb'
  ] LOOP
    PERFORM pg_temp.capture_count(v_table, 'before');
  END LOOP;
END;
$$;

-- --------------------------------------------------------------------------
-- Detach manual/derived references that would otherwise block deletes.
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ledger_entries') IS NOT NULL
     AND pg_temp.column_exists('ledger_entries', 'statement_transaction_id')
     AND to_regclass('public.statement_transactions') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.ledger_entries AS le
      SET statement_transaction_id = NULL
      WHERE le.statement_transaction_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.statement_transactions AS st
          WHERE st.id = le.statement_transaction_id
        )
    $sql$;
  END IF;

  IF to_regclass('public.ledger_entries') IS NOT NULL
     AND pg_temp.column_exists('ledger_entries', 'receipt_id')
     AND to_regclass('public.receipts') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.ledger_entries AS le
      SET receipt_id = NULL
      WHERE le.receipt_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.receipts AS r
          WHERE r.id = le.receipt_id
        )
    $sql$;
  END IF;

  IF to_regclass('public.advance_repayments') IS NOT NULL
     AND pg_temp.column_exists('advance_repayments', 'statement_transaction_id')
     AND to_regclass('public.statement_transactions') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.advance_repayments AS ar
      SET statement_transaction_id = NULL
      WHERE ar.statement_transaction_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.statement_transactions AS st
          WHERE st.id = ar.statement_transaction_id
        )
    $sql$;
  END IF;

  IF to_regclass('public.investment_transactions') IS NOT NULL
     AND pg_temp.column_exists('investment_transactions', 'statement_transaction_id')
     AND to_regclass('public.statement_transactions') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.investment_transactions AS it
      SET statement_transaction_id = NULL
      WHERE it.statement_transaction_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.statement_transactions AS st
          WHERE st.id = it.statement_transaction_id
        )
    $sql$;
  END IF;

  IF to_regclass('public.receipt_uploads') IS NOT NULL
     AND pg_temp.column_exists('receipt_uploads', 'committed_receipt_id') THEN
    EXECUTE 'UPDATE public.receipt_uploads SET committed_receipt_id = NULL WHERE committed_receipt_id IS NOT NULL';
  END IF;

  IF to_regclass('public.receipt_staging_transactions') IS NOT NULL
     AND pg_temp.column_exists('receipt_staging_transactions', 'committed_receipt_id') THEN
    EXECUTE 'UPDATE public.receipt_staging_transactions SET committed_receipt_id = NULL WHERE committed_receipt_id IS NOT NULL';
  END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- Delete derived/audit data that should not survive imported-row removal.
-- --------------------------------------------------------------------------
SELECT pg_temp.delete_all_if_exists('mappings');
SELECT pg_temp.delete_all_if_exists('transaction_links');

DO $$
BEGIN
  IF to_regclass('public.merchant_categorization_audit') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.merchant_categorization_audit';
  END IF;

  IF to_regclass('public.grocery_purchase_history') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.grocery_purchase_history';
  END IF;

  IF to_regclass('public.grocery_item_summaries') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.grocery_item_summaries';
  END IF;
END;
$$;

-- --------------------------------------------------------------------------
-- Remove imported receipt data.
-- --------------------------------------------------------------------------
SELECT pg_temp.delete_all_if_exists('receipt_items');
SELECT pg_temp.delete_all_if_exists('receipts');
SELECT pg_temp.delete_all_if_exists('receipt_uploads');

-- --------------------------------------------------------------------------
-- Remove imported statement data.
-- --------------------------------------------------------------------------
SELECT pg_temp.delete_all_if_exists('statement_transactions');
SELECT pg_temp.delete_all_if_exists('statement_summaries');
SELECT pg_temp.delete_all_if_exists('statement_imports');
SELECT pg_temp.delete_all_if_exists('file_imports');
SELECT pg_temp.delete_all_if_exists('statement_uploads');
SELECT pg_temp.delete_all_if_exists('statement_parse_sessions');

DO $$
DECLARE
  v_table text;
  v_changed_preserved text;
  v_nonzero_affected text;
  v_orphan_count bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'statement_transactions',
    'statement_transaction_tags',
    'statement_imports',
    'statement_summaries',
    'file_imports',
    'import_staging',
    'approval_log',
    'staging_transaction_links',
    'statement_uploads',
    'statement_parse_sessions',
    'receipts',
    'receipt_tags',
    'receipt_items',
    'receipt_uploads',
    'receipt_staging_transactions',
    'receipt_staging_items',
    'receipt_duplicate_candidates',
    'receipt_classification_runs',
    'receipt_item_classifications',
    'mappings',
    'transaction_links',
    'merchant_categorization_audit',
    'grocery_purchase_history',
    'grocery_item_summaries',
    'categories',
    'receipt_categories',
    'tags',
    'merchants',
    'merchant_aliases',
    'statement_merchant_kb',
    'receipt_merchant_kb',
    'receipt_item_kb'
  ] LOOP
    PERFORM pg_temp.capture_count(v_table, 'after');
  END LOOP;

  SELECT string_agg(before_counts.table_name, ', ' ORDER BY before_counts.table_name)
  INTO v_changed_preserved
  FROM cleanup_counts AS before_counts
  JOIN cleanup_counts AS after_counts
    ON after_counts.phase = 'after'
   AND after_counts.table_name = before_counts.table_name
  WHERE before_counts.phase = 'before'
    AND before_counts.table_name IN (
      'categories',
      'receipt_categories',
      'tags',
      'merchants',
      'merchant_aliases',
      'statement_merchant_kb',
      'receipt_merchant_kb',
      'receipt_item_kb'
    )
    AND before_counts.row_count <> after_counts.row_count;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'preserved_tables_unchanged',
    CASE WHEN v_changed_preserved IS NULL THEN 'pass' ELSE 'fail' END,
    COALESCE(v_changed_preserved, 'Preserved tables retained their original row counts.')
  );

  IF v_changed_preserved IS NOT NULL THEN
    RAISE EXCEPTION 'Cleanup aborted: preserved tables changed: %', v_changed_preserved;
  END IF;

  SELECT string_agg(after_counts.table_name || '=' || after_counts.row_count, ', ' ORDER BY after_counts.table_name)
  INTO v_nonzero_affected
  FROM cleanup_counts AS after_counts
  WHERE after_counts.phase = 'after'
    AND after_counts.table_name IN (
      'statement_transactions',
      'statement_transaction_tags',
      'statement_imports',
      'statement_summaries',
      'file_imports',
      'import_staging',
      'approval_log',
      'staging_transaction_links',
      'statement_uploads',
      'statement_parse_sessions',
      'receipts',
      'receipt_tags',
      'receipt_items',
      'receipt_uploads',
      'receipt_staging_transactions',
      'receipt_staging_items',
      'receipt_duplicate_candidates',
      'receipt_classification_runs',
      'receipt_item_classifications',
      'mappings',
      'transaction_links',
      'merchant_categorization_audit',
      'grocery_purchase_history',
      'grocery_item_summaries'
    )
    AND after_counts.row_count <> 0;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'affected_tables_cleared',
    CASE WHEN v_nonzero_affected IS NULL THEN 'pass' ELSE 'fail' END,
    COALESCE(v_nonzero_affected, 'All imported-data tables were cleared to zero rows.')
  );

  IF v_nonzero_affected IS NOT NULL THEN
    RAISE EXCEPTION 'Cleanup aborted: affected tables still contain rows: %', v_nonzero_affected;
  END IF;

  v_orphan_count := 0;
  IF to_regclass('public.ledger_entries') IS NOT NULL
     AND pg_temp.column_exists('ledger_entries', 'statement_transaction_id') THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.ledger_entries AS le
      WHERE le.statement_transaction_id IS NOT NULL
    $sql$
    INTO v_orphan_count;
  END IF;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'ledger_entries_statement_transaction_refs_clear',
    CASE WHEN v_orphan_count = 0 THEN 'pass' ELSE 'fail' END,
    CASE
      WHEN v_orphan_count = 0 THEN 'No ledger entries still reference statement transactions.'
      ELSE format('%s ledger entry rows still reference statement transactions.', v_orphan_count)
    END
  );

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup aborted: % ledger_entries rows still reference statement_transactions.', v_orphan_count;
  END IF;

  v_orphan_count := 0;
  IF to_regclass('public.ledger_entries') IS NOT NULL
     AND pg_temp.column_exists('ledger_entries', 'receipt_id') THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.ledger_entries AS le
      WHERE le.receipt_id IS NOT NULL
    $sql$
    INTO v_orphan_count;
  END IF;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'ledger_entries_receipt_refs_clear',
    CASE WHEN v_orphan_count = 0 THEN 'pass' ELSE 'fail' END,
    CASE
      WHEN v_orphan_count = 0 THEN 'No ledger entries still reference receipts.'
      ELSE format('%s ledger entry rows still reference receipts.', v_orphan_count)
    END
  );

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup aborted: % ledger_entries rows still reference receipts.', v_orphan_count;
  END IF;

  v_orphan_count := 0;
  IF to_regclass('public.advance_repayments') IS NOT NULL
     AND pg_temp.column_exists('advance_repayments', 'statement_transaction_id') THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.advance_repayments AS ar
      WHERE ar.statement_transaction_id IS NOT NULL
    $sql$
    INTO v_orphan_count;
  END IF;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'advance_repayments_statement_transaction_refs_clear',
    CASE WHEN v_orphan_count = 0 THEN 'pass' ELSE 'fail' END,
    CASE
      WHEN v_orphan_count = 0 THEN 'No advance repayments still reference statement transactions.'
      ELSE format('%s advance repayment rows still reference statement transactions.', v_orphan_count)
    END
  );

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup aborted: % advance_repayments rows still reference statement_transactions.', v_orphan_count;
  END IF;

  v_orphan_count := 0;
  IF to_regclass('public.investment_transactions') IS NOT NULL
     AND pg_temp.column_exists('investment_transactions', 'statement_transaction_id') THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.investment_transactions AS it
      WHERE it.statement_transaction_id IS NOT NULL
    $sql$
    INTO v_orphan_count;
  END IF;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'investment_transactions_statement_transaction_refs_clear',
    CASE WHEN v_orphan_count = 0 THEN 'pass' ELSE 'fail' END,
    CASE
      WHEN v_orphan_count = 0 THEN 'No investment transactions still reference statement transactions.'
      ELSE format('%s investment transaction rows still reference statement transactions.', v_orphan_count)
    END
  );

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup aborted: % investment_transactions rows still reference statement_transactions.', v_orphan_count;
  END IF;

  v_orphan_count := 0;
  IF to_regclass('public.receipt_uploads') IS NOT NULL
     AND pg_temp.column_exists('receipt_uploads', 'committed_receipt_id') THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.receipt_uploads
      WHERE committed_receipt_id IS NOT NULL
    $sql$
    INTO v_orphan_count;
  END IF;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'receipt_uploads_committed_receipt_refs_clear',
    CASE WHEN v_orphan_count = 0 THEN 'pass' ELSE 'fail' END,
    CASE
      WHEN v_orphan_count = 0 THEN 'No receipt uploads still reference committed receipts.'
      ELSE format('%s receipt upload rows still reference committed receipts.', v_orphan_count)
    END
  );

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup aborted: % receipt_uploads rows still reference committed receipts.', v_orphan_count;
  END IF;

  v_orphan_count := 0;
  IF to_regclass('public.receipt_staging_transactions') IS NOT NULL
     AND pg_temp.column_exists('receipt_staging_transactions', 'committed_receipt_id') THEN
    EXECUTE $sql$
      SELECT count(*)
      FROM public.receipt_staging_transactions
      WHERE committed_receipt_id IS NOT NULL
    $sql$
    INTO v_orphan_count;
  END IF;

  INSERT INTO cleanup_validations (validation_name, status, details)
  VALUES (
    'receipt_staging_transactions_committed_receipt_refs_clear',
    CASE WHEN v_orphan_count = 0 THEN 'pass' ELSE 'fail' END,
    CASE
      WHEN v_orphan_count = 0 THEN 'No receipt staging rows still reference committed receipts.'
      ELSE format('%s receipt staging rows still reference committed receipts.', v_orphan_count)
    END
  );

  IF v_orphan_count <> 0 THEN
    RAISE EXCEPTION 'Cleanup aborted: % receipt_staging_transactions rows still reference committed receipts.', v_orphan_count;
  END IF;
END;
$$;

COMMIT;

SELECT
  'count' AS result_type,
  before_counts.table_name AS name,
  before_counts.row_count::text AS before_value,
  after_counts.row_count::text AS after_value,
  CASE
    WHEN before_counts.table_name IN (
      'categories',
      'receipt_categories',
      'tags',
      'merchants',
      'merchant_aliases',
      'statement_merchant_kb',
      'receipt_merchant_kb',
      'receipt_item_kb'
    ) AND before_counts.row_count = after_counts.row_count THEN 'pass'
    WHEN before_counts.table_name IN (
      'statement_transactions',
      'statement_transaction_tags',
      'statement_imports',
      'statement_summaries',
      'file_imports',
      'import_staging',
      'approval_log',
      'staging_transaction_links',
      'statement_uploads',
      'statement_parse_sessions',
      'receipts',
      'receipt_tags',
      'receipt_items',
      'receipt_uploads',
      'receipt_staging_transactions',
      'receipt_staging_items',
      'receipt_duplicate_candidates',
      'receipt_classification_runs',
      'receipt_item_classifications',
      'mappings',
      'transaction_links',
      'merchant_categorization_audit',
      'grocery_purchase_history',
      'grocery_item_summaries'
    ) AND after_counts.row_count = 0 THEN 'pass'
    ELSE 'warn'
  END AS status,
  CASE
    WHEN before_counts.table_name IN (
      'categories',
      'receipt_categories',
      'tags',
      'merchants',
      'merchant_aliases',
      'statement_merchant_kb',
      'receipt_merchant_kb',
      'receipt_item_kb'
    ) THEN 'Preserved table'
    ELSE 'Cleaned table'
  END AS details
FROM cleanup_counts AS before_counts
JOIN cleanup_counts AS after_counts
  ON after_counts.phase = 'after'
 AND after_counts.table_name = before_counts.table_name
WHERE before_counts.phase = 'before'

UNION ALL

SELECT
  'validation' AS result_type,
  validation_name AS name,
  NULL AS before_value,
  NULL AS after_value,
  status,
  details
FROM cleanup_validations

ORDER BY result_type, name;
