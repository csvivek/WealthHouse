-- ============================================================================
-- Migration: 003_fix_member_role_enum.sql
-- Purpose:   Add missing 'self' value to member_role enum.
--            The 000a migration's DO block silently skipped CREATE TYPE
--            when the enum already existed without 'self'.
-- ============================================================================

ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'self' BEFORE 'spouse';
