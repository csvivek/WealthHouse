# WealthHouse Merchant Learning System

## Objective

The merchant intelligence layer is a memory system for merchant categorization.
Known merchants should be categorized from memory before any AI call is made.
Unknown merchants may be analyzed with GenAI, but permanent knowledge is only created after approval.

## Three-Stage Pipeline

### Stage 1 — Retrieval

For every imported merchant string:
1. Normalize the merchant name.
2. Attempt knowledge lookup in this order:
   - exact canonical merchant match
   - alias match
   - fuzzy similarity match
   - merchant family grouping
3. If a known approved merchant is found:
   - reuse its approved category
   - skip GenAI
   - mark `decision_source` as `knowledge_base` or `alias_resolution`

### Stage 2 — GenAI Merchant Inference

If no knowledge-base match is found:
1. Pass the normalized merchant name and transaction context to GenAI.
2. Ask for:
   - canonical merchant name
   - business type
   - suggested category from `categories.md`
   - confidence score
   - explanation
   - ambiguity flag
3. If the suggested category is not in `categories.md`, reject it and send the result for manual review.
4. GenAI outputs are provisional and must not create permanent memory automatically.

### Stage 3 — Learning Loop

GenAI suggestions are stored as pending intelligence, not durable knowledge.
Only after user approval or correction should the system:
- create or update the merchant knowledge base entry
- attach aliases
- update usage statistics
- mark the decision as reviewed

## Merchant Knowledge Base Fields

Each merchant memory record should maintain:
- `canonical_merchant_name`
- `normalized_merchant_name`
- `family_name`
- `aliases`
- `business_type`
- `approved_category`
- `confidence`
- `source_of_decision`
- `first_seen_date`
- `last_reviewed_date`
- `usage_count`
- `notes`

## Merchant Name Normalization Rules

Apply these steps in order:
- lowercase conversion
- remove punctuation noise and duplicate separators
- remove payment processor prefixes where they do not carry merchant identity
- remove company suffixes like `pte ltd`, `llc`, `inc`, `co`
- remove terminal IDs, authorization fragments, and masked card fragments
- remove trailing outlet numbers where possible
- remove timestamps and embedded dates
- collapse whitespace

### Examples

- `NTUC FAIRPRICE` -> `ntuc fairprice`
- `NTUC FairPrice Pte Ltd` -> `ntuc fairprice`
- `FAIRPRICE XTRA` -> `fairprice xtra`
- `GRAB*FOOD` -> `grab food`
- `GrabPay 238947` -> `grab`
- `GRAB SG` -> `grab`

## Ambiguous Merchant Rules

Use secondary signals when the merchant family is ambiguous.

### Grab
- ride, taxi, car, simplygo -> `Transport`
- food, delivery, restaurant -> `Eating Out`
- mart, groceries, supermarket -> `Groceries`

### Amazon / Shopee
- pantry, grocery, fresh, mart -> `Groceries`
- default marketplace behavior -> `Shopping`

### Mustafa
- grocery-related receipt items -> `Groceries`
- otherwise -> `Shopping`

## Confidence and Review Rules

- exact canonical match: usually review not required
- alias match: usually review not required
- fuzzy match: review if similarity is not decisively high
- all GenAI suggestions: review required before durable learning
- any invalid category suggestion: review required
- any ambiguity flag: review required

## Decision Sources

Audit records must use one of:
- `knowledge_base`
- `genai_suggestion`
- `manual_override`
- `alias_resolution`
