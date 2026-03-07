-- ============================================================================
-- Migration: 000a_prerequisites.sql
-- Purpose:   Create prerequisite tables (households, household_members) and
--            enums required by user_profiles and the rest of the schema.
-- Run this BEFORE 000_user_profiles.sql
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Enums
-- --------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.member_role AS ENUM ('self', 'spouse', 'child', 'parent', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- --------------------------------------------------------------------------
-- 2. households table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.households (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text        NOT NULL,
  base_currency  text        NOT NULL DEFAULT 'INR',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own household" ON public.households
  FOR SELECT USING (
    id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own household" ON public.households
  FOR UPDATE USING (
    id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 3. household_members table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.household_members (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id   uuid        NOT NULL REFERENCES public.households(id),
  display_name   text        NOT NULL,
  role           public.member_role NOT NULL DEFAULT 'self',
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own household members" ON public.household_members
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can manage own household members" ON public.household_members
  FOR ALL USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );
