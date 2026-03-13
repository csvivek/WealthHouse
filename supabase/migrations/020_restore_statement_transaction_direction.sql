-- ============================================================================
-- Migration: 020_restore_statement_transaction_direction.sql
-- Purpose:   Restore direction-only txn_type values only when the live enum
--            supports debit/credit labels. Legacy semantic enums are skipped.
-- ============================================================================

DO $$
DECLARE
  has_direction_values boolean := false;
  remaining_non_direction_count bigint := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typnamespace = 'public'::regnamespace
      AND t.typname = 'txn_type'
      AND e.enumlabel IN ('debit', 'credit')
    GROUP BY t.oid
    HAVING count(DISTINCT e.enumlabel) = 2
  )
  INTO has_direction_values;

  IF has_direction_values THEN
    UPDATE public.statement_transactions AS committed
    SET txn_type = staging.txn_type::public.txn_type
    FROM public.import_staging AS staging
    WHERE staging.committed_transaction_id = committed.id
      AND staging.txn_type IN ('debit', 'credit', 'unknown')
      AND committed.txn_type::text NOT IN ('debit', 'credit', 'unknown');

    SELECT count(*)
      INTO remaining_non_direction_count
      FROM public.statement_transactions
     WHERE txn_type::text NOT IN ('debit', 'credit', 'unknown');

    RAISE NOTICE 'Remaining statement_transactions with non-direction txn_type: %', remaining_non_direction_count;
  ELSE
    RAISE NOTICE 'Skipping txn_type direction restore because public.txn_type does not include debit/credit labels in this environment.';
  END IF;
END $$;
