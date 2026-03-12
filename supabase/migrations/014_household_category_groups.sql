-- ============================================================================
-- Migration: 014_household_category_groups.sql
-- Purpose:   Add household-scoped editable category groups for payment/receipt
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_category_groups (
  id bigserial PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  payment_subtype public.category_payment_subtype NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  is_system_seeded boolean NOT NULL DEFAULT false,
  template_key text,
  description text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, household_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_category_groups_household_subtype_name_ci_uq
  ON public.payment_category_groups (household_id, payment_subtype, lower(name));

CREATE INDEX IF NOT EXISTS payment_category_groups_household_sort_idx
  ON public.payment_category_groups (household_id, payment_subtype, is_archived, sort_order, id);

CREATE TABLE IF NOT EXISTS public.payment_category_group_memberships (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  category_id bigint NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  group_id bigint NOT NULL REFERENCES public.payment_category_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, category_id)
);

ALTER TABLE public.payment_category_group_memberships
  DROP CONSTRAINT IF EXISTS payment_category_group_memberships_group_id_household_id_fkey;

ALTER TABLE public.payment_category_group_memberships
  ADD CONSTRAINT payment_category_group_memberships_group_id_household_id_fkey
  FOREIGN KEY (group_id, household_id)
  REFERENCES public.payment_category_groups(id, household_id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS payment_category_group_memberships_group_sort_idx
  ON public.payment_category_group_memberships (group_id, sort_order, category_id);

CREATE INDEX IF NOT EXISTS payment_category_group_memberships_household_idx
  ON public.payment_category_group_memberships (household_id, group_id);

CREATE TABLE IF NOT EXISTS public.receipt_category_groups (
  id bigserial PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  is_system_seeded boolean NOT NULL DEFAULT false,
  template_key text,
  description text,
  created_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, household_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_category_groups_household_name_ci_uq
  ON public.receipt_category_groups (household_id, lower(name));

CREATE INDEX IF NOT EXISTS receipt_category_groups_household_sort_idx
  ON public.receipt_category_groups (household_id, is_archived, sort_order, id);

CREATE TABLE IF NOT EXISTS public.receipt_category_group_memberships (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  receipt_category_id uuid NOT NULL REFERENCES public.receipt_categories(id) ON DELETE CASCADE,
  group_id bigint NOT NULL REFERENCES public.receipt_category_groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, receipt_category_id)
);

ALTER TABLE public.receipt_category_group_memberships
  DROP CONSTRAINT IF EXISTS receipt_category_group_memberships_group_id_household_id_fkey;

ALTER TABLE public.receipt_category_group_memberships
  ADD CONSTRAINT receipt_category_group_memberships_group_id_household_id_fkey
  FOREIGN KEY (group_id, household_id)
  REFERENCES public.receipt_category_groups(id, household_id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS receipt_category_group_memberships_group_sort_idx
  ON public.receipt_category_group_memberships (group_id, sort_order, receipt_category_id);

CREATE INDEX IF NOT EXISTS receipt_category_group_memberships_household_idx
  ON public.receipt_category_group_memberships (household_id, group_id);

CREATE OR REPLACE FUNCTION public.enforce_payment_category_group_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  category_subtype public.category_payment_subtype;
BEGIN
  SELECT COALESCE(c.payment_subtype, c.type::text::public.category_payment_subtype)
  INTO category_subtype
  FROM public.categories c
  WHERE c.id = NEW.category_id;

  IF category_subtype IS NULL THEN
    category_subtype := 'expense';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_category_groups g
    WHERE g.id = NEW.group_id
      AND g.household_id = NEW.household_id
      AND g.payment_subtype = category_subtype
  ) THEN
    RAISE EXCEPTION 'Payment category group (%) is not compatible with category (%) for household (%).', NEW.group_id, NEW.category_id, NEW.household_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_category_group_memberships_enforce_tg ON public.payment_category_group_memberships;
CREATE TRIGGER payment_category_group_memberships_enforce_tg
BEFORE INSERT OR UPDATE OF household_id, category_id, group_id
ON public.payment_category_group_memberships
FOR EACH ROW
EXECUTE FUNCTION public.enforce_payment_category_group_membership();

CREATE OR REPLACE FUNCTION public.enforce_receipt_category_group_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.receipt_category_groups g
    WHERE g.id = NEW.group_id
      AND g.household_id = NEW.household_id
  ) THEN
    RAISE EXCEPTION 'Receipt category group (%) does not belong to household (%).', NEW.group_id, NEW.household_id;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipt_category_group_memberships_enforce_tg ON public.receipt_category_group_memberships;
CREATE TRIGGER receipt_category_group_memberships_enforce_tg
BEFORE INSERT OR UPDATE OF household_id, receipt_category_id, group_id
ON public.receipt_category_group_memberships
FOR EACH ROW
EXECUTE FUNCTION public.enforce_receipt_category_group_membership();

DROP TRIGGER IF EXISTS payment_category_groups_set_updated_at ON public.payment_category_groups;
CREATE TRIGGER payment_category_groups_set_updated_at
BEFORE UPDATE ON public.payment_category_groups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS receipt_category_groups_set_updated_at ON public.receipt_category_groups;
CREATE TRIGGER receipt_category_groups_set_updated_at
BEFORE UPDATE ON public.receipt_category_groups
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS payment_category_group_memberships_set_updated_at ON public.payment_category_group_memberships;
CREATE TRIGGER payment_category_group_memberships_set_updated_at
BEFORE UPDATE ON public.payment_category_group_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS receipt_category_group_memberships_set_updated_at ON public.receipt_category_group_memberships;
CREATE TRIGGER receipt_category_group_memberships_set_updated_at
BEFORE UPDATE ON public.receipt_category_group_memberships
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
