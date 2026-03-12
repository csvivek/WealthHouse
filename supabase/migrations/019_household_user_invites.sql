-- ============================================================================
-- Migration: 019_household_user_invites.sql
-- Purpose:   Add household login-user invites and update profile provisioning
--            so invited users join an existing household instead of creating a
--            new one.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.household_user_invites (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id     uuid        NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  email            text        NOT NULL,
  normalized_email text        NOT NULL,
  display_name     text        NULL,
  role             text        NOT NULL DEFAULT 'member',
  invited_by       uuid        NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  accepted_user_id uuid        NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  accepted_at      timestamptz NULL,
  revoked_at       timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS household_user_invites_pending_email_uq
  ON public.household_user_invites (normalized_email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS household_user_invites_household_created_idx
  ON public.household_user_invites (household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS household_user_invites_invited_by_idx
  ON public.household_user_invites (invited_by, created_at DESC);

DROP TRIGGER IF EXISTS trg_household_user_invites_updated_at ON public.household_user_invites;
CREATE TRIGGER trg_household_user_invites_updated_at
  BEFORE UPDATE ON public.household_user_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.household_user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own household invites" ON public.household_user_invites;
CREATE POLICY "Users can view own household invites" ON public.household_user_invites
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own household invites" ON public.household_user_invites;
CREATE POLICY "Users can manage own household invites" ON public.household_user_invites
  FOR ALL USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

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

  INSERT INTO public.households (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email) || '''s Household')
  RETURNING id INTO new_household_id;

  INSERT INTO public.user_profiles (id, household_id, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    new_household_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    'owner'
  );

  INSERT INTO public.household_members (household_id, display_name, role)
  VALUES (
    new_household_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'self'
  );

  RETURN NEW;
END;
$$;

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
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = _user_id) THEN
    RETURN;
  END IF;

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
    VALUES (
      _hid,
      COALESCE(NULLIF(_invite_name, ''), _full_name, _email),
      'other'
    );

    UPDATE public.household_user_invites
    SET
      accepted_user_id = _user_id,
      accepted_at = now(),
      updated_at = now()
    WHERE id = _invite_id;

    RETURN;
  END IF;

  INSERT INTO public.households (name)
  VALUES (COALESCE(_full_name, _email) || '''s Household')
  RETURNING id INTO _hid;

  INSERT INTO public.user_profiles (id, household_id, display_name, avatar_url, role)
  VALUES (_user_id, _hid, COALESCE(_full_name, _email), _avatar_url, 'owner');

  INSERT INTO public.household_members (household_id, display_name, role)
  VALUES (_hid, COALESCE(_full_name, _email), 'self');
END;
$$;
