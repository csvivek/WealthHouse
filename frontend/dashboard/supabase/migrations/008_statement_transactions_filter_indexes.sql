-- Performance indexes for dashboard/transactions filters and household date RPC paths.
CREATE INDEX IF NOT EXISTS statement_transactions_account_id_txn_date_idx
  ON public.statement_transactions (account_id, txn_date DESC);

CREATE INDEX IF NOT EXISTS statement_transactions_category_id_txn_date_idx
  ON public.statement_transactions (category_id, txn_date DESC)
  WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS statement_transactions_household_txn_date_txn_type_idx
  ON public.statement_transactions (household_id, txn_date DESC, txn_type);
