-- Receipt category styling metadata + mapped-count performance index

ALTER TABLE public.receipt_categories
  ADD COLUMN IF NOT EXISTS icon_key text,
  ADD COLUMN IF NOT EXISTS color_token text,
  ADD COLUMN IF NOT EXISTS color_hex text;

UPDATE public.receipt_categories
SET
  icon_key = COALESCE(NULLIF(icon_key, ''), CASE
    WHEN lower(name) ~ '(salary|payroll|bonus|income)' THEN 'salary'
    WHEN lower(name) ~ '(refund|reimbursement)' THEN 'income'
    WHEN lower(name) ~ '(transfer|xfer)' THEN 'transfer'
    WHEN lower(name) ~ '(grocery|supermarket|mart)' THEN 'groceries'
    WHEN lower(name) ~ '(food|dining|restaurant|cafe|coffee)' THEN 'food'
    WHEN lower(name) ~ '(transport|taxi|grab|uber|bus|train|mrt)' THEN 'transport'
    WHEN lower(name) ~ '(home|housing|rent|mortgage)' THEN 'home'
    WHEN lower(name) ~ '(utility|electric|water|gas|internet|phone)' THEN 'utilities'
    WHEN lower(name) ~ '(health|medical|clinic|hospital|pharmacy)' THEN 'healthcare'
    WHEN lower(name) ~ '(education|school|tuition|course)' THEN 'education'
    WHEN lower(name) ~ '(entertainment|movie|music|game|stream)' THEN 'entertainment'
    WHEN lower(name) ~ '(cash|atm|withdrawal)' THEN 'cash'
    ELSE 'tag'
  END),
  color_token = COALESCE(NULLIF(color_token, ''), CASE
    WHEN lower(name) ~ '(salary|payroll|bonus|income|refund|reimbursement)' THEN 'chart-1'
    WHEN lower(name) ~ '(grocery|supermarket|mart|food|dining|restaurant|cafe|coffee)' THEN 'chart-2'
    WHEN lower(name) ~ '(transfer|xfer|education|school|tuition|course)' THEN 'chart-3'
    WHEN lower(name) ~ '(transport|taxi|grab|uber|bus|train|mrt|utility|electric|water|gas|internet|phone|cash|atm|withdrawal)' THEN 'chart-4'
    WHEN lower(name) ~ '(home|housing|rent|mortgage|health|medical|clinic|hospital|pharmacy|entertainment|movie|music|game|stream)' THEN 'chart-5'
    ELSE 'slate'
  END);

ALTER TABLE public.receipt_categories
  ALTER COLUMN icon_key SET DEFAULT 'tag',
  ALTER COLUMN icon_key SET NOT NULL,
  ALTER COLUMN color_token SET DEFAULT 'slate',
  ALTER COLUMN color_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS receipt_staging_transactions_household_category_date_idx
  ON public.receipt_staging_transactions (household_id, receipt_category_id, txn_date DESC)
  WHERE receipt_category_id IS NOT NULL;
