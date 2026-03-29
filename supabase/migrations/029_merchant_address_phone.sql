-- ============================================================================
-- Migration: 029_merchant_address_phone.sql
-- Purpose:   Add merchant_address and merchant_phone to receipt staging and
--            final receipts tables so the system can capture store contact
--            details extracted from receipts.
-- ============================================================================

ALTER TABLE public.receipt_staging_transactions
  ADD COLUMN IF NOT EXISTS merchant_address text,
  ADD COLUMN IF NOT EXISTS merchant_phone text;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS merchant_address text,
  ADD COLUMN IF NOT EXISTS merchant_phone text;
