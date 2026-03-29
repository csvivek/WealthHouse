-- Migration: 032_advance_transaction_linking.sql
-- Purpose: Link statement_transactions to advances bidirectionally.
--          Adds statement_transaction_id FK to advances (the originating bank tx),
--          seeds "Advances Given" and "Advances Recovered" categories so they
--          appear in the category picker for imported statements.

-- ── 1. Add statement_transaction_id to advances ───────────────────────────────

ALTER TABLE public.advances
  ADD COLUMN IF NOT EXISTS statement_transaction_id uuid
    REFERENCES public.statement_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS advances_statement_transaction_id_idx
  ON public.advances (statement_transaction_id)
  WHERE statement_transaction_id IS NOT NULL;

-- ── 2. Seed advance categories ────────────────────────────────────────────────
-- "Advances Given"    = money lent out  (debit from your account, transfer type)
-- "Advances Recovered" = money returned  (credit into your account, transfer type)
-- Both use ledger_view = cash_flow so they appear in cash flow reports.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(name) = 'advances given'
  ) THEN
    INSERT INTO public.categories (
      name, type, ledger_view, domain_type, payment_subtype,
      icon_key, color_token, is_active
    ) VALUES (
      'Advances Given',
      'transfer'::public.category_type,
      'cash_flow'::public.ledger_view,
      'payment'::public.category_domain_type,
      'transfer'::public.category_payment_subtype,
      'hand-coins',
      'amber',
      true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.categories WHERE lower(name) = 'advances recovered'
  ) THEN
    INSERT INTO public.categories (
      name, type, ledger_view, domain_type, payment_subtype,
      icon_key, color_token, is_active
    ) VALUES (
      'Advances Recovered',
      'transfer'::public.category_type,
      'cash_flow'::public.ledger_view,
      'payment'::public.category_domain_type,
      'transfer'::public.category_payment_subtype,
      'hand-coins',
      'emerald',
      true
    );
  END IF;
END $$;
