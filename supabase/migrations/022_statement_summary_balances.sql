-- ============================================================================
-- Migration: 022_statement_summary_balances.sql
-- Purpose:   Persist opening/closing balances from imported statement summaries
--            so chat and dashboard net-worth flows can read latest statement
--            balances without inferring from transaction history.
-- ============================================================================

ALTER TABLE IF EXISTS public.statement_summaries
  ADD COLUMN IF NOT EXISTS opening_balance numeric NULL,
  ADD COLUMN IF NOT EXISTS closing_balance numeric NULL;

UPDATE public.statement_summaries AS summaries
SET
  opening_balance = CASE
    WHEN jsonb_typeof(file_imports.summary_json -> 'opening_balance') = 'number'
      THEN (file_imports.summary_json ->> 'opening_balance')::numeric
    ELSE summaries.opening_balance
  END,
  closing_balance = CASE
    WHEN jsonb_typeof(file_imports.summary_json -> 'closing_balance') = 'number'
      THEN (file_imports.summary_json ->> 'closing_balance')::numeric
    ELSE summaries.closing_balance
  END
FROM public.statement_imports AS statement_imports
JOIN public.file_imports AS file_imports
  ON file_imports.id = statement_imports.file_import_id
WHERE summaries.statement_import_id = statement_imports.id
  AND (
    summaries.opening_balance IS NULL
    OR summaries.closing_balance IS NULL
  );
