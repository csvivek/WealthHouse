-- ============================================================================
-- Migration: 027_transaction_link_chains_and_ledger_views.sql
-- Purpose:   Add transfer-chain metadata for multi-hop transaction linking and
--            introduce category ledger views for spending vs cash-flow reports.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.ledger_view AS ENUM ('spending', 'cash_flow', 'excluded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.transaction_links
  ADD COLUMN IF NOT EXISTS transfer_chain_id uuid NULL,
  ADD COLUMN IF NOT EXISTS allocated_amount numeric NULL;

DO $$ BEGIN
  ALTER TABLE public.transaction_links
    ADD CONSTRAINT transaction_links_allocated_amount_positive
    CHECK (allocated_amount IS NULL OR allocated_amount > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS transaction_links_chain_idx
  ON public.transaction_links (transfer_chain_id)
  WHERE transfer_chain_id IS NOT NULL;

ALTER TABLE public.staging_transaction_links
  ADD COLUMN IF NOT EXISTS transfer_chain_id uuid NULL,
  ADD COLUMN IF NOT EXISTS allocated_amount numeric NULL;

DO $$ BEGIN
  ALTER TABLE public.staging_transaction_links
    ADD CONSTRAINT staging_transaction_links_allocated_amount_positive
    CHECK (allocated_amount IS NULL OR allocated_amount > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS staging_transaction_links_chain_idx
  ON public.staging_transaction_links (transfer_chain_id)
  WHERE transfer_chain_id IS NOT NULL;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS ledger_view public.ledger_view;

UPDATE public.categories
SET ledger_view = CASE
  WHEN lower(name) ~ '(credit card payment|card payment|cc payment|loan repayment|loan payment|salary|bonus|business income|dividend|interest|rental income|advance|refund|reimbursement|investment purchase|investment sale)'
    THEN 'cash_flow'::public.ledger_view
  WHEN lower(name) ~ '(internal transfer|wallet top-?up|wallet top up|crypto buy|crypto sell|crypto purchase|crypto sale)'
    THEN 'excluded'::public.ledger_view
  WHEN type = 'income'
    THEN 'cash_flow'::public.ledger_view
  WHEN type = 'transfer'
    THEN 'excluded'::public.ledger_view
  ELSE 'spending'::public.ledger_view
END
WHERE ledger_view IS NULL;

ALTER TABLE public.categories
  ALTER COLUMN ledger_view SET DEFAULT 'spending',
  ALTER COLUMN ledger_view SET NOT NULL;
