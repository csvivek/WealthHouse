-- Reporting-oriented taxonomy hierarchy above leaf categories

CREATE TABLE IF NOT EXISTS public.category_groups (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  domain text,
  subtype text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.category_subgroups (
  id bigserial PRIMARY KEY,
  group_id bigint NOT NULL REFERENCES public.category_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  subtype text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS category_groups_name_ci_uq
  ON public.category_groups (lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS category_subgroups_group_name_ci_uq
  ON public.category_subgroups (group_id, lower(name));

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS group_id bigint REFERENCES public.category_groups(id),
  ADD COLUMN IF NOT EXISTS subgroup_id bigint REFERENCES public.category_subgroups(id);

WITH seeded_groups AS (
  INSERT INTO public.category_groups (name)
  SELECT DISTINCT c.group_name
  FROM public.categories c
  WHERE c.group_name IS NOT NULL
    AND btrim(c.group_name) <> ''
  ON CONFLICT DO NOTHING
  RETURNING id, name
)
UPDATE public.categories c
SET group_id = g.id
FROM public.category_groups g
WHERE c.group_id IS NULL
  AND c.group_name IS NOT NULL
  AND lower(c.group_name) = lower(g.name);

CREATE OR REPLACE FUNCTION public.enforce_category_taxonomy_relationships()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_group public.category_groups%ROWTYPE;
  selected_subgroup public.category_subgroups%ROWTYPE;
BEGIN
  IF NEW.subgroup_id IS NOT NULL THEN
    SELECT * INTO selected_subgroup
    FROM public.category_subgroups
    WHERE id = NEW.subgroup_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected subgroup (%) does not exist.', NEW.subgroup_id;
    END IF;

    IF NEW.group_id IS NULL THEN
      NEW.group_id := selected_subgroup.group_id;
    END IF;
  END IF;

  IF NEW.group_id IS NOT NULL THEN
    SELECT * INTO selected_group
    FROM public.category_groups
    WHERE id = NEW.group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Selected group (%) does not exist.', NEW.group_id;
    END IF;
  END IF;

  IF NEW.subgroup_id IS NOT NULL AND selected_subgroup.group_id <> NEW.group_id THEN
    RAISE EXCEPTION 'Category subgroup (%) must belong to selected group (%).', NEW.subgroup_id, NEW.group_id;
  END IF;

  IF selected_group.id IS NOT NULL AND selected_subgroup.id IS NOT NULL THEN
    IF selected_group.domain IS NOT NULL
      AND selected_subgroup.domain IS NOT NULL
      AND selected_group.domain <> selected_subgroup.domain THEN
      RAISE EXCEPTION 'Domain mismatch between group (%) and subgroup (%).', selected_group.domain, selected_subgroup.domain;
    END IF;

    IF selected_group.subtype IS NOT NULL
      AND selected_subgroup.subtype IS NOT NULL
      AND selected_group.subtype <> selected_subgroup.subtype THEN
      RAISE EXCEPTION 'Subtype mismatch between group (%) and subgroup (%).', selected_group.subtype, selected_subgroup.subtype;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_taxonomy_relationships_tg ON public.categories;
CREATE TRIGGER categories_taxonomy_relationships_tg
BEFORE INSERT OR UPDATE OF group_id, subgroup_id
ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.enforce_category_taxonomy_relationships();

CREATE OR REPLACE VIEW public.v_category_group_transaction_totals AS
SELECT
  g.id AS group_id,
  g.name AS group_name,
  g.domain,
  g.subtype,
  COUNT(t.id) AS transaction_count,
  COALESCE(SUM(t.amount), 0)::numeric AS transaction_total
FROM public.category_groups g
LEFT JOIN public.categories c ON c.group_id = g.id
LEFT JOIN public.statement_transactions t ON t.category_id = c.id
GROUP BY g.id, g.name, g.domain, g.subtype;

CREATE OR REPLACE VIEW public.v_category_subgroup_transaction_totals AS
SELECT
  sg.id AS subgroup_id,
  sg.group_id,
  g.name AS group_name,
  sg.name AS subgroup_name,
  COALESCE(sg.domain, g.domain) AS domain,
  COALESCE(sg.subtype, g.subtype) AS subtype,
  COUNT(t.id) AS transaction_count,
  COALESCE(SUM(t.amount), 0)::numeric AS transaction_total
FROM public.category_subgroups sg
JOIN public.category_groups g ON g.id = sg.group_id
LEFT JOIN public.categories c ON c.subgroup_id = sg.id
LEFT JOIN public.statement_transactions t ON t.category_id = c.id
GROUP BY sg.id, sg.group_id, g.name, sg.name, sg.domain, sg.subtype, g.domain, g.subtype;

CREATE OR REPLACE VIEW public.v_category_group_child_counts AS
SELECT
  g.id AS group_id,
  g.name AS group_name,
  COUNT(DISTINCT sg.id) AS subgroup_count,
  COUNT(DISTINCT c.id) AS category_count
FROM public.category_groups g
LEFT JOIN public.category_subgroups sg ON sg.group_id = g.id
LEFT JOIN public.categories c ON c.group_id = g.id
GROUP BY g.id, g.name;

CREATE OR REPLACE VIEW public.v_category_subgroup_child_counts AS
SELECT
  sg.id AS subgroup_id,
  sg.group_id,
  sg.name AS subgroup_name,
  COUNT(c.id) AS category_count
FROM public.category_subgroups sg
LEFT JOIN public.categories c ON c.subgroup_id = sg.id
GROUP BY sg.id, sg.group_id, sg.name;

CREATE OR REPLACE VIEW public.v_category_taxonomy_hierarchy AS
SELECT
  COALESCE(sg.domain, g.domain) AS domain,
  g.id AS group_id,
  g.name AS group_name,
  sg.id AS subgroup_id,
  sg.name AS subgroup_name,
  c.id AS category_id,
  c.name AS category_name,
  c.type AS category_type
FROM public.categories c
LEFT JOIN public.category_groups g ON g.id = c.group_id
LEFT JOIN public.category_subgroups sg ON sg.id = c.subgroup_id
ORDER BY COALESCE(sg.domain, g.domain, 'uncategorized'), g.name, sg.name, c.name;
