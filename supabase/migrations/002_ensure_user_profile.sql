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
  _user_id       uuid;
  _email         text;
  _normalized    text;
  _full_name     text;
  _avatar_url    text;
  _hid           uuid;
  _invite_id     uuid;
  _invite_name   text;
  _invite_role   text;
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

  _normalized := lower(trim(COALESCE(_email, '')));

  SELECT
    invite.id,
    invite.household_id,
    invite.display_name,
    invite.role
  INTO _invite_id, _hid, _invite_name, _invite_role
  FROM public.household_user_invites AS invite
  WHERE invite.normalized_email = _normalized
    AND invite.accepted_at IS NULL
    AND invite.revoked_at IS NULL
  ORDER BY invite.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF _invite_id IS NOT NULL THEN
    INSERT INTO public.user_profiles (id, household_id, display_name, avatar_url, role)
    VALUES (
      _user_id,
      _hid,
      COALESCE(NULLIF(_invite_name, ''), _full_name, _email),
      _avatar_url,
      COALESCE(NULLIF(_invite_role, ''), 'member')
    );

    INSERT INTO public.household_members (household_id, display_name, role)
    VALUES (_hid, COALESCE(NULLIF(_invite_name, ''), _full_name, _email), 'other');

    UPDATE public.household_user_invites
    SET
      accepted_user_id = _user_id,
      accepted_at = now(),
      updated_at = now()
    WHERE id = _invite_id;

    RETURN;
  END IF;

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
