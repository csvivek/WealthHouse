-- ============================================================================
-- Migration: 015_fix_category_group_membership_uniqueness.sql
-- Purpose:   Remove incorrect one-membership-per-group uniqueness constraints
-- ============================================================================

ALTER TABLE public.payment_category_group_memberships
  DROP CONSTRAINT IF EXISTS payment_category_group_memberships_group_id_household_id_key;

ALTER TABLE public.receipt_category_group_memberships
  DROP CONSTRAINT IF EXISTS receipt_category_group_memberships_group_id_household_id_key;
