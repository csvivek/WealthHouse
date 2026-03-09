-- Dashboard aggregate RPCs for server-side summaries and breakdowns.

DROP FUNCTION IF EXISTS public.get_account_dashboard_summary(uuid[], date, date);
CREATE OR REPLACE FUNCTION public.get_account_dashboard_summary(
  p_account_ids uuid[] DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  active_accounts bigint,
  investment_holdings bigint,
  total_card_outstanding numeric,
  total_income numeric,
  total_expenses numeric,
  net_cash_flow numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered_txns AS (
    SELECT t.amount, t.txn_type
    FROM public.statement_transactions t
    WHERE (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
      AND (p_start_date IS NULL OR t.txn_date >= p_start_date)
      AND (p_end_date IS NULL OR t.txn_date <= p_end_date)
  ),
  txn_totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN txn_type = 'credit' THEN abs(amount) ELSE 0 END), 0) AS total_income,
      COALESCE(SUM(CASE WHEN txn_type = 'debit' THEN abs(amount) ELSE 0 END), 0) AS total_expenses
    FROM filtered_txns
  )
  SELECT
    COALESCE((
      SELECT COUNT(*)
      FROM public.accounts a
      WHERE a.is_active = true
        AND (p_account_ids IS NULL OR a.id = ANY(p_account_ids))
    ), 0) AS active_accounts,
    COALESCE((
      SELECT COUNT(*)
      FROM public.asset_balances ab
      WHERE (p_account_ids IS NULL OR ab.account_id = ANY(p_account_ids))
    ), 0) AS investment_holdings,
    COALESCE((
      SELECT SUM(COALESCE(c.total_outstanding, 0))
      FROM public.cards c
      WHERE (p_account_ids IS NULL OR c.account_id = ANY(p_account_ids))
    ), 0) AS total_card_outstanding,
    tt.total_income,
    tt.total_expenses,
    tt.total_income - tt.total_expenses AS net_cash_flow
  FROM txn_totals tt;
$$;

DROP FUNCTION IF EXISTS public.get_breakdown_transactions(uuid[], date, date);
CREATE OR REPLACE FUNCTION public.get_breakdown_transactions(
  p_account_ids uuid[] DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  month_start date,
  income numeric,
  expenses numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', t.txn_date)::date AS month_start,
    COALESCE(SUM(CASE WHEN t.txn_type = 'credit' THEN abs(t.amount) ELSE 0 END), 0) AS income,
    COALESCE(SUM(CASE WHEN t.txn_type = 'debit' THEN abs(t.amount) ELSE 0 END), 0) AS expenses
  FROM public.statement_transactions t
  WHERE (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
    AND (p_start_date IS NULL OR t.txn_date >= p_start_date)
    AND (p_end_date IS NULL OR t.txn_date <= p_end_date)
  GROUP BY 1
  ORDER BY 1;
$$;

DROP FUNCTION IF EXISTS public.get_payment_breakdown(uuid[], date, date);
CREATE OR REPLACE FUNCTION public.get_payment_breakdown(
  p_account_ids uuid[] DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  category_id bigint,
  category_name text,
  total_amount numeric,
  txn_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id AS category_id,
    c.name AS category_name,
    COALESCE(SUM(abs(t.amount)), 0) AS total_amount,
    COUNT(*) AS txn_count
  FROM public.statement_transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.txn_type = 'debit'
    AND (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
    AND (p_start_date IS NULL OR t.txn_date >= p_start_date)
    AND (p_end_date IS NULL OR t.txn_date <= p_end_date)
  GROUP BY c.id, c.name
  ORDER BY total_amount DESC;
$$;

DROP FUNCTION IF EXISTS public.get_receipt_breakdown(uuid[], date, date);
CREATE OR REPLACE FUNCTION public.get_receipt_breakdown(
  p_account_ids uuid[] DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  category_id bigint,
  category_name text,
  total_amount numeric,
  txn_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id AS category_id,
    c.name AS category_name,
    COALESCE(SUM(abs(t.amount)), 0) AS total_amount,
    COUNT(*) AS txn_count
  FROM public.statement_transactions t
  LEFT JOIN public.categories c ON c.id = t.category_id
  WHERE t.txn_type = 'credit'
    AND (p_account_ids IS NULL OR t.account_id = ANY(p_account_ids))
    AND (p_start_date IS NULL OR t.txn_date >= p_start_date)
    AND (p_end_date IS NULL OR t.txn_date <= p_end_date)
  GROUP BY c.id, c.name
  ORDER BY total_amount DESC;
$$;
