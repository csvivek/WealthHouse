-- ============================================================================
-- Migration: 000_user_profiles.sql
-- Purpose:   Create user_profiles table bridging auth.users to households
--
-- This migration sets up:
--   1. user_profiles        – Links auth.users to a household
--   2. Auto-create trigger  – On signup: create household, profile, and member
--   3. RLS policies         – Users can only read/update their own profile
--   4. updated_at trigger   – Auto-updates updated_at on row change
--
-- Prerequisites:
--   - public.households table must already exist
--   - public.household_members table must already exist
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. user_profiles table
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id),
  household_id  uuid        NOT NULL REFERENCES public.households(id),
  display_name  text,
  avatar_url    text,
  role          text        NOT NULL DEFAULT 'owner',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 2. updated_at trigger
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- --------------------------------------------------------------------------
-- 3. Auto-create trigger on auth.users insert
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id uuid;
  pending_invite_id uuid;
BEGIN
  SELECT invite.id
  INTO pending_invite_id
  FROM public.household_user_invites AS invite
  WHERE invite.normalized_email = lower(trim(COALESCE(NEW.email, '')))
    AND invite.accepted_at IS NULL
    AND invite.revoked_at IS NULL
  ORDER BY invite.created_at DESC
  LIMIT 1;

  IF pending_invite_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Create a household for the new user
  INSERT INTO public.households (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s Household')
  RETURNING id INTO new_household_id;

  -- Create the user profile linking user to household
  INSERT INTO public.user_profiles (id, household_id, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    new_household_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'owner'
  );

  -- Create a household member entry
  INSERT INTO public.household_members (household_id, display_name, role)
  VALUES (
    new_household_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'self'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- --------------------------------------------------------------------------
-- 4. Row-Level Security Policies
-- --------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);
