-- ============================================================================
-- Migration: 027_advances_workflow.sql
-- Purpose:   Upgrade advances module to full workflow with household scoping,
--            direction (given/taken), repayment event types, and write-off metadata.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New enums
-- ----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.advance_direction AS ENUM ('given', 'taken');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.advance_event_type AS ENUM ('recovery', 'repayment', 'adjustment', 'writeoff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Alter counterparties — add household scoping, phone, type, timestamp
-- ----------------------------------------------------------------------------

ALTER TABLE public.counterparties
  ADD COLUMN IF NOT EXISTS household_id uuid NULL REFERENCES public.households(id),
  ADD COLUMN IF NOT EXISTS phone text NULL,
  ADD COLUMN IF NOT EXISTS counterparty_type text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.counterparties
    ADD CONSTRAINT counterparties_type_check
    CHECK (counterparty_type IS NULL OR counterparty_type IN ('person', 'business', 'unknown'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS counterparties_household_id_idx
  ON public.counterparties (household_id)
  WHERE household_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Alter advances — add household_id, direction, workflow fields
-- ----------------------------------------------------------------------------

ALTER TABLE public.advances
  ADD COLUMN IF NOT EXISTS household_id uuid NULL REFERENCES public.households(id),
  ADD COLUMN IF NOT EXISTS direction public.advance_direction NULL,
  ADD COLUMN IF NOT EXISTS payment_mode text NULL,
  ADD COLUMN IF NOT EXISTS is_cash_advance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS writeoff_date date NULL,
  ADD COLUMN IF NOT EXISTS writeoff_reason text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Back-fill direction from is_recoverable for existing rows
UPDATE public.advances
SET direction = CASE
  WHEN is_recoverable = true THEN 'given'::public.advance_direction
  ELSE 'taken'::public.advance_direction
END
WHERE direction IS NULL;

CREATE INDEX IF NOT EXISTS advances_household_id_status_idx
  ON public.advances (household_id, status)
  WHERE household_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS advances_due_date_idx
  ON public.advances (due_date)
  WHERE due_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS advances_counterparty_id_idx
  ON public.advances (counterparty_id);

-- ----------------------------------------------------------------------------
-- 4. Alter advance_repayments — add event_type
-- ----------------------------------------------------------------------------

ALTER TABLE public.advance_repayments
  ADD COLUMN IF NOT EXISTS event_type public.advance_event_type NOT NULL DEFAULT 'repayment';

CREATE INDEX IF NOT EXISTS advance_repayments_advance_id_idx
  ON public.advance_repayments (advance_id);

-- ----------------------------------------------------------------------------
-- 5. RLS policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_repayments ENABLE ROW LEVEL SECURITY;

-- counterparties: household-scoped (also allow legacy NULL rows for backward compat)
DO $$ BEGIN
  CREATE POLICY counterparties_household_select ON public.counterparties
    FOR SELECT USING (
      household_id IS NULL
      OR household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY counterparties_household_insert ON public.counterparties
    FOR INSERT WITH CHECK (
      household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY counterparties_household_update ON public.counterparties
    FOR UPDATE USING (
      household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- advances: household-scoped
DO $$ BEGIN
  CREATE POLICY advances_household_select ON public.advances
    FOR SELECT USING (
      household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY advances_household_insert ON public.advances
    FOR INSERT WITH CHECK (
      household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY advances_household_update ON public.advances
    FOR UPDATE USING (
      household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY advances_household_delete ON public.advances
    FOR DELETE USING (
      household_id = (
        SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- advance_repayments: scoped through advances join
DO $$ BEGIN
  CREATE POLICY advance_repayments_household_select ON public.advance_repayments
    FOR SELECT USING (
      advance_id IN (
        SELECT id FROM public.advances
        WHERE household_id = (
          SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY advance_repayments_household_insert ON public.advance_repayments
    FOR INSERT WITH CHECK (
      advance_id IN (
        SELECT id FROM public.advances
        WHERE household_id = (
          SELECT household_id FROM public.user_profiles WHERE id = auth.uid()
        )
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
