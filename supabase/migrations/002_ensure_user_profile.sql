-- ============================================================================
-- Migration: 002_ensure_user_profile.sql
-- Purpose:   RPC function to ensure a user_profiles row exists for the
--            authenticated user. Acts as a fallback when the on_auth_user_created
--            trigger fails silently (e.g. race condition, missing prerequisite table).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id    uuid;
  _email      text;
  _full_name  text;
  _avatar_url text;
  _hid        uuid;
BEGIN
  -- Get the calling user's id
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = _user_id) THEN
    RETURN;
  END IF;

  -- Fetch metadata from auth.users
  SELECT
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'avatar_url',
    email
  INTO _full_name, _avatar_url, _email
  FROM auth.users
  WHERE id = _user_id;

  -- Create household
  INSERT INTO public.households (name)
  VALUES (COALESCE(_full_name, _email) || '''s Household')
  RETURNING id INTO _hid;

  -- Create profile
  INSERT INTO public.user_profiles (id, household_id, display_name, avatar_url, role)
  VALUES (_user_id, _hid, COALESCE(_full_name, _email), _avatar_url, 'owner');

  -- Create household member
  INSERT INTO public.household_members (household_id, display_name, role)
  VALUES (_hid, COALESCE(_full_name, _email), 'self');
END;
$$;
