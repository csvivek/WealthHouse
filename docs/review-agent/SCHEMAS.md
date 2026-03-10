# Documentation Agent Machine-Readable Schemas

Source-of-truth files live under `docs/review-agent/`.

- `bug-registry.json`: canonical bug source-of-truth (`bugs[]` keyed by stable `id`).
- `review-history.json`: one post-merge structured review record per merged PR.
- `change-log.json`: normalized release/change entries.
- `module-impact-index.json`: aggregate index of module impact over time.
- `config.json`: runtime configuration/risk patterns.

Field-level constraints are defined in `schemas/review-agent.schema.json`.
