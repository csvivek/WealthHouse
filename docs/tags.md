# Tags

Tags are household-scoped labels stored in `public.tags` and attached through:

- `public.statement_transaction_tags`
- `public.receipt_tags`

Provisioning rules:

- `ensure_household_default_tags(household_id)` seeds the default tag set once per normalized name.
- `ensure_member_tag_for_member(member_id)` creates a member tag from `household_members.display_name` on insert.
- Deleted tags stay in `tags` with `is_active = false` so provisioning does not silently recreate them.
- Member tags are not auto-renamed on member/profile edits. The current system has no safe ownership signal for distinguishing untouched system tags from user-customized ones.

Import integration:

- Statement staging stores `tagIds` and `tagSuggestions` inside `import_staging.original_data`.
- Receipt staging stores `tag_ids_json` and `tag_suggestions_json` on `receipt_staging_transactions`.
- Final commit/approval upserts into the join tables idempotently.

Suggestion flow:

- `frontend/dashboard/src/lib/tags/suggestions.ts` is the deterministic tag suggestion layer.
- Inputs are merchant/category/source text/member names only. Keep it household-safe and additive.
- Extend rules here before adding any new AI-dependent tagging behavior.
