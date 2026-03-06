-- ============================================================================
-- Migration: 001_data_integrity.sql
-- Purpose:   Create tables for the Data Integrity Agent
--
-- This migration sets up:
--   1. audit_log          – Tracks every write operation across all tables
--   2. data_quarantine    – Soft quarantine for flagged records pending review
--   3. reconciliation_runs – Tracks reconciliation check results
--   4. RLS policies       – Row-level security so users only see their own data
--
-- How to run:
--   1. Open your Supabase project dashboard
--   2. Go to SQL Editor (left sidebar)
--   3. Click "New Query"
--   4. Paste the entire contents of this file
--   5. Click "Run" to execute
--
-- Prerequisites:
--   - The `profiles` table must already exist (referenced by foreign keys)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. audit_log
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  old_data jsonb,
  new_data jsonb,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_categorized', 'ai_receipt', 'plaid_import', 'crypto_sync', 'system')),
  user_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_record ON audit_log(record_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- --------------------------------------------------------------------------
-- 2. data_quarantine
-- --------------------------------------------------------------------------
CREATE TYPE quarantine_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE quarantine_status AS ENUM ('pending', 'approved', 'rejected', 'auto_approved');

CREATE TABLE IF NOT EXISTS data_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  reason text NOT NULL,
  severity quarantine_severity NOT NULL DEFAULT 'medium',
  status quarantine_status NOT NULL DEFAULT 'pending',
  source text NOT NULL CHECK (source IN ('ai_categorized', 'ai_receipt', 'plaid_import', 'crypto_sync', 'duplicate_detection', 'anomaly_detection')),
  data_snapshot jsonb NOT NULL,
  suggested_fix jsonb,
  user_id uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id)
);

CREATE INDEX idx_quarantine_status ON data_quarantine(status);
CREATE INDEX idx_quarantine_user ON data_quarantine(user_id);
CREATE INDEX idx_quarantine_table ON data_quarantine(table_name, record_id);

-- --------------------------------------------------------------------------
-- 3. reconciliation_runs
-- --------------------------------------------------------------------------
CREATE TYPE reconciliation_type AS ENUM ('balance_check', 'duplicate_detection', 'category_audit', 'anomaly_scan', 'full_reconciliation');
CREATE TYPE reconciliation_status AS ENUM ('pass', 'warning', 'fail');

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  type reconciliation_type NOT NULL,
  status reconciliation_status NOT NULL,
  summary text,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  records_checked integer DEFAULT 0,
  issues_found integer DEFAULT 0,
  run_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reconciliation_user ON reconciliation_runs(user_id);
CREATE INDEX idx_reconciliation_run_at ON reconciliation_runs(run_at DESC);

-- --------------------------------------------------------------------------
-- 4. Row-Level Security Policies
-- --------------------------------------------------------------------------

-- Enable RLS on all integrity tables
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own audit logs
CREATE POLICY "Users can view own audit logs" ON audit_log
  FOR SELECT USING (auth.uid() = user_id);

-- Users can view and update their own quarantine items
CREATE POLICY "Users can view own quarantine" ON data_quarantine
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own quarantine" ON data_quarantine
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can insert into all integrity tables
CREATE POLICY "Service can insert audit logs" ON audit_log
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can insert quarantine" ON data_quarantine
  FOR INSERT WITH CHECK (true);

-- Users can view own reconciliation runs
CREATE POLICY "Users can view own reconciliation" ON reconciliation_runs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service can insert reconciliation" ON reconciliation_runs
  FOR INSERT WITH CHECK (true);
