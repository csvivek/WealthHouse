-- ============================================================================
-- Migration: 017_tags.sql
-- Purpose:   Add household-scoped tags, transaction tag mappings, staged tag
--            metadata, provisioning helpers, and safe merge/delete RPCs.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.tag_source AS ENUM ('default', 'member', 'custom', 'system');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.normalize_tag_name(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(regexp_replace(COALESCE(value, ''), '\s+', ' ', 'g')));
$$;

CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  color_token text NOT NULL DEFAULT 'slate',
  color_hex text NULL,
  icon_key text NOT NULL DEFAULT 'tag',
  description text NULL,
  source public.tag_source NOT NULL DEFAULT 'custom',
  source_member_id uuid NULL REFERENCES public.household_members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  merged_into_tag_id uuid NULL REFERENCES public.tags(id) ON DELETE SET NULL,
  created_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, household_id),
  CONSTRAINT tags_name_not_blank_chk CHECK (length(trim(regexp_replace(name, '\s+', ' ', 'g'))) > 0),
  CONSTRAINT tags_normalized_name_not_blank_chk CHECK (length(normalized_name) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_household_normalized_name_uq
  ON public.tags (household_id, normalized_name);

CREATE INDEX IF NOT EXISTS tags_household_active_name_idx
  ON public.tags (household_id, is_active, name);

CREATE INDEX IF NOT EXISTS tags_household_source_idx
  ON public.tags (household_id, source, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS tags_normalized_name_idx
  ON public.tags (normalized_name);

CREATE TABLE IF NOT EXISTS public.statement_transaction_tags (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  statement_transaction_id uuid NOT NULL REFERENCES public.statement_transactions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (statement_transaction_id, tag_id)
);

CREATE INDEX IF NOT EXISTS statement_transaction_tags_household_tag_idx
  ON public.statement_transaction_tags (household_id, tag_id, created_at DESC);

CREATE INDEX IF NOT EXISTS statement_transaction_tags_household_txn_idx
  ON public.statement_transaction_tags (household_id, statement_transaction_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.receipt_tags (
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_by uuid NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (receipt_id, tag_id)
);

CREATE INDEX IF NOT EXISTS receipt_tags_household_tag_idx
  ON public.receipt_tags (household_id, tag_id, created_at DESC);

CREATE INDEX IF NOT EXISTS receipt_tags_household_receipt_idx
  ON public.receipt_tags (household_id, receipt_id, created_at DESC);

ALTER TABLE public.receipt_staging_transactions
  ADD COLUMN IF NOT EXISTS tag_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tag_suggestions_json jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.prepare_tag_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.name := trim(regexp_replace(COALESCE(NEW.name, ''), '\s+', ' ', 'g'));
  NEW.normalized_name := public.normalize_tag_name(NEW.name);
  IF NEW.normalized_name = '' THEN
    RAISE EXCEPTION 'Tag name cannot be blank.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tags_prepare_row ON public.tags;
CREATE TRIGGER tags_prepare_row
BEFORE INSERT OR UPDATE OF name ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.prepare_tag_row();

DROP TRIGGER IF EXISTS tags_set_updated_at ON public.tags;
CREATE TRIGGER tags_set_updated_at
BEFORE UPDATE ON public.tags
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_statement_transaction_tag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tag_household_id uuid;
  tag_is_active boolean;
  transaction_household_id uuid;
BEGIN
  SELECT t.household_id, t.is_active
  INTO tag_household_id, tag_is_active
  FROM public.tags t
  WHERE t.id = NEW.tag_id;

  IF tag_household_id IS NULL THEN
    RAISE EXCEPTION 'Tag (%) does not exist.', NEW.tag_id;
  END IF;

  SELECT a.household_id
  INTO transaction_household_id
  FROM public.statement_transactions st
  JOIN public.accounts a ON a.id = st.account_id
  WHERE st.id = NEW.statement_transaction_id;

  IF transaction_household_id IS NULL THEN
    RAISE EXCEPTION 'Statement transaction (%) does not exist.', NEW.statement_transaction_id;
  END IF;

  IF NEW.household_id <> tag_household_id OR NEW.household_id <> transaction_household_id THEN
    RAISE EXCEPTION 'Statement tag mapping household mismatch.';
  END IF;

  IF NOT tag_is_active THEN
    RAISE EXCEPTION 'Cannot assign inactive tag (%).', NEW.tag_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS statement_transaction_tags_validate_tg ON public.statement_transaction_tags;
CREATE TRIGGER statement_transaction_tags_validate_tg
BEFORE INSERT OR UPDATE OF household_id, statement_transaction_id, tag_id
ON public.statement_transaction_tags
FOR EACH ROW
EXECUTE FUNCTION public.validate_statement_transaction_tag();

CREATE OR REPLACE FUNCTION public.validate_receipt_tag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tag_household_id uuid;
  tag_is_active boolean;
  receipt_household_id uuid;
BEGIN
  SELECT t.household_id, t.is_active
  INTO tag_household_id, tag_is_active
  FROM public.tags t
  WHERE t.id = NEW.tag_id;

  IF tag_household_id IS NULL THEN
    RAISE EXCEPTION 'Tag (%) does not exist.', NEW.tag_id;
  END IF;

  SELECT r.household_id
  INTO receipt_household_id
  FROM public.receipts r
  WHERE r.id = NEW.receipt_id;

  IF receipt_household_id IS NULL THEN
    RAISE EXCEPTION 'Receipt (%) does not exist.', NEW.receipt_id;
  END IF;

  IF NEW.household_id <> tag_household_id OR NEW.household_id <> receipt_household_id THEN
    RAISE EXCEPTION 'Receipt tag mapping household mismatch.';
  END IF;

  IF NOT tag_is_active THEN
    RAISE EXCEPTION 'Cannot assign inactive tag (%).', NEW.tag_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipt_tags_validate_tg ON public.receipt_tags;
CREATE TRIGGER receipt_tags_validate_tg
BEFORE INSERT OR UPDATE OF household_id, receipt_id, tag_id
ON public.receipt_tags
FOR EACH ROW
EXECUTE FUNCTION public.validate_receipt_tag();

CREATE OR REPLACE FUNCTION public.ensure_household_default_tags(
  p_household_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_household_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH desired(name) AS (
    SELECT unnest(ARRAY[
      'Tax',
      'Reimburse',
      'Split',
      'Business',
      'Personal',
      'Travel',
      'Subscription',
      'Medical',
      'Gift',
      'Family',
      'Friends',
      'Work',
      'Vacation',
      'Education',
      'Home',
      'Emergency Fund',
      'Insurance',
      'Investment',
      'Charity',
      'Celebration'
    ]::text[])
  ), inserted AS (
    INSERT INTO public.tags (
      household_id,
      name,
      normalized_name,
      source,
      created_by,
      updated_by
    )
    SELECT
      p_household_id,
      desired.name,
      public.normalize_tag_name(desired.name),
      'default'::public.tag_source,
      p_actor_user_id,
      p_actor_user_id
    FROM desired
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.tags t
      WHERE t.household_id = p_household_id
        AND t.normalized_name = public.normalize_tag_name(desired.name)
    )
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM inserted;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_member_tag_for_member(
  p_member_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  member_row public.household_members%ROWTYPE;
  existing_id uuid;
BEGIN
  SELECT *
  INTO member_row
  FROM public.household_members
  WHERE id = p_member_id;

  IF member_row.id IS NULL OR NOT member_row.is_active THEN
    RETURN NULL;
  END IF;

  SELECT t.id
  INTO existing_id
  FROM public.tags t
  WHERE t.household_id = member_row.household_id
    AND t.normalized_name = public.normalize_tag_name(member_row.display_name)
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO public.tags (
    household_id,
    name,
    normalized_name,
    source,
    source_member_id,
    created_by,
    updated_by
  )
  VALUES (
    member_row.household_id,
    trim(regexp_replace(member_row.display_name, '\s+', ' ', 'g')),
    public.normalize_tag_name(member_row.display_name),
    'member'::public.tag_source,
    member_row.id,
    p_actor_user_id,
    p_actor_user_id
  )
  RETURNING id INTO existing_id;

  RETURN existing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_household_member_tags(
  p_household_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  member_row record;
  ensured uuid;
  ensured_count integer := 0;
BEGIN
  IF p_household_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR member_row IN
    SELECT hm.id
    FROM public.household_members hm
    WHERE hm.household_id = p_household_id
      AND hm.is_active = true
    ORDER BY hm.created_at ASC
  LOOP
    ensured := public.ensure_member_tag_for_member(member_row.id, p_actor_user_id);
    IF ensured IS NOT NULL THEN
      ensured_count := ensured_count + 1;
    END IF;
  END LOOP;

  RETURN ensured_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_household_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_household_default_tags(NEW.id, NULL);
  PERFORM public.ensure_household_member_tags(NEW.id, NULL);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS households_seed_tags_tg ON public.households;
CREATE TRIGGER households_seed_tags_tg
AFTER INSERT ON public.households
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_household_tags();

CREATE OR REPLACE FUNCTION public.handle_household_member_tag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active THEN
    PERFORM public.ensure_member_tag_for_member(NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS household_members_seed_tag_tg ON public.household_members;
CREATE TRIGGER household_members_seed_tag_tg
AFTER INSERT ON public.household_members
FOR EACH ROW
EXECUTE FUNCTION public.handle_household_member_tag();

CREATE OR REPLACE FUNCTION public.merge_tag_safe(
  p_household_id uuid,
  p_survivor_id uuid,
  p_victim_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  survivor_tag public.tags%ROWTYPE;
  victim_tag public.tags%ROWTYPE;
  statement_inserted integer := 0;
  receipt_inserted integer := 0;
  statement_removed integer := 0;
  receipt_removed integer := 0;
BEGIN
  IF p_survivor_id IS NULL OR p_victim_id IS NULL OR p_household_id IS NULL THEN
    RAISE EXCEPTION 'Household, survivor tag, and victim tag are required.';
  END IF;

  IF p_survivor_id = p_victim_id THEN
    RAISE EXCEPTION 'Cannot merge a tag into itself.';
  END IF;

  SELECT * INTO survivor_tag
  FROM public.tags
  WHERE id = p_survivor_id
    AND household_id = p_household_id;

  IF survivor_tag.id IS NULL THEN
    RAISE EXCEPTION 'Survivor tag not found for household.';
  END IF;

  SELECT * INTO victim_tag
  FROM public.tags
  WHERE id = p_victim_id
    AND household_id = p_household_id;

  IF victim_tag.id IS NULL THEN
    RAISE EXCEPTION 'Victim tag not found for household.';
  END IF;

  INSERT INTO public.statement_transaction_tags (
    household_id,
    statement_transaction_id,
    tag_id,
    created_by
  )
  SELECT
    p_household_id,
    stt.statement_transaction_id,
    p_survivor_id,
    COALESCE(p_actor_user_id, stt.created_by)
  FROM public.statement_transaction_tags stt
  WHERE stt.household_id = p_household_id
    AND stt.tag_id = p_victim_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS statement_inserted = ROW_COUNT;

  INSERT INTO public.receipt_tags (
    household_id,
    receipt_id,
    tag_id,
    created_by
  )
  SELECT
    p_household_id,
    rt.receipt_id,
    p_survivor_id,
    COALESCE(p_actor_user_id, rt.created_by)
  FROM public.receipt_tags rt
  WHERE rt.household_id = p_household_id
    AND rt.tag_id = p_victim_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS receipt_inserted = ROW_COUNT;

  DELETE FROM public.statement_transaction_tags
  WHERE household_id = p_household_id
    AND tag_id = p_victim_id;
  GET DIAGNOSTICS statement_removed = ROW_COUNT;

  DELETE FROM public.receipt_tags
  WHERE household_id = p_household_id
    AND tag_id = p_victim_id;
  GET DIAGNOSTICS receipt_removed = ROW_COUNT;

  UPDATE public.tags
  SET
    is_active = false,
    merged_into_tag_id = p_survivor_id,
    updated_by = p_actor_user_id,
    updated_at = now()
  WHERE id = p_victim_id
    AND household_id = p_household_id;

  RETURN jsonb_build_object(
    'householdId', p_household_id,
    'survivorId', p_survivor_id,
    'victimId', p_victim_id,
    'statementAdded', statement_inserted,
    'receiptAdded', receipt_inserted,
    'statementDetached', statement_removed,
    'receiptDetached', receipt_removed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tag_safe(
  p_household_id uuid,
  p_tag_id uuid,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  tag_row public.tags%ROWTYPE;
  statement_removed integer := 0;
  receipt_removed integer := 0;
BEGIN
  IF p_household_id IS NULL OR p_tag_id IS NULL THEN
    RAISE EXCEPTION 'Household and tag are required.';
  END IF;

  SELECT * INTO tag_row
  FROM public.tags
  WHERE id = p_tag_id
    AND household_id = p_household_id;

  IF tag_row.id IS NULL THEN
    RAISE EXCEPTION 'Tag not found for household.';
  END IF;

  DELETE FROM public.statement_transaction_tags
  WHERE household_id = p_household_id
    AND tag_id = p_tag_id;
  GET DIAGNOSTICS statement_removed = ROW_COUNT;

  DELETE FROM public.receipt_tags
  WHERE household_id = p_household_id
    AND tag_id = p_tag_id;
  GET DIAGNOSTICS receipt_removed = ROW_COUNT;

  UPDATE public.tags
  SET
    is_active = false,
    merged_into_tag_id = NULL,
    updated_by = p_actor_user_id,
    updated_at = now()
  WHERE id = p_tag_id
    AND household_id = p_household_id;

  RETURN jsonb_build_object(
    'householdId', p_household_id,
    'tagId', p_tag_id,
    'statementDetached', statement_removed,
    'receiptDetached', receipt_removed
  );
END;
$$;

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own tags" ON public.tags;
CREATE POLICY "Users can view own tags" ON public.tags
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own tags" ON public.tags;
CREATE POLICY "Users can insert own tags" ON public.tags
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own tags" ON public.tags;
CREATE POLICY "Users can update own tags" ON public.tags
  FOR UPDATE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own statement transaction tags" ON public.statement_transaction_tags;
CREATE POLICY "Users can view own statement transaction tags" ON public.statement_transaction_tags
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own statement transaction tags" ON public.statement_transaction_tags;
CREATE POLICY "Users can insert own statement transaction tags" ON public.statement_transaction_tags
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own statement transaction tags" ON public.statement_transaction_tags;
CREATE POLICY "Users can delete own statement transaction tags" ON public.statement_transaction_tags
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can view own receipt tags" ON public.receipt_tags;
CREATE POLICY "Users can view own receipt tags" ON public.receipt_tags
  FOR SELECT USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own receipt tags" ON public.receipt_tags;
CREATE POLICY "Users can insert own receipt tags" ON public.receipt_tags
  FOR INSERT WITH CHECK (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own receipt tags" ON public.receipt_tags;
CREATE POLICY "Users can delete own receipt tags" ON public.receipt_tags
  FOR DELETE USING (
    household_id IN (SELECT household_id FROM public.user_profiles WHERE id = auth.uid())
  );

SELECT public.ensure_household_default_tags(h.id, NULL)
FROM public.households h;

SELECT public.ensure_household_member_tags(h.id, NULL)
FROM public.households h;
