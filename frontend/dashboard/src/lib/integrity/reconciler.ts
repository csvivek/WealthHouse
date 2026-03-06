import { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

interface ReconciliationFinding {
  type: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  table: string
  record_id?: string
  expected?: unknown
  actual?: unknown
}

interface ReconciliationResult {
  type: string
  status: 'pass' | 'warning' | 'fail'
  summary: string
  findings: ReconciliationFinding[]
  recordsChecked: number
  issuesFound: number
}

async function getHouseholdAccountIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('household_id')
    .eq('id', userId)
    .single()

  if (!profile) return []

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', profile.household_id)

  return (accounts ?? []).map(a => a.id)
}

/**
 * Check 1: Duplicate Detection
 * Finds statement_transactions that look like duplicates (same amount, date, merchant within same account).
 */
export async function checkDuplicateTransactions(
  supabase: SupabaseClient,
  userId: string
): Promise<ReconciliationResult> {
  const findings: ReconciliationFinding[] = []
  const accountIds = await getHouseholdAccountIds(supabase, userId)

  if (accountIds.length === 0) {
    return { type: 'duplicate_detection', status: 'pass', summary: 'No accounts found.', findings: [], recordsChecked: 0, issuesFound: 0 }
  }

  const { data: transactions } = await supabase
    .from('statement_transactions')
    .select('id, account_id, amount, txn_date, merchant_normalized, merchant_raw, txn_type')
    .in('account_id', accountIds)
    .order('txn_date', { ascending: false })

  if (!transactions || transactions.length === 0) {
    return { type: 'duplicate_detection', status: 'pass', summary: 'No transactions to check.', findings: [], recordsChecked: 0, issuesFound: 0 }
  }

  const seen = new Map<string, string[]>()
  for (const txn of transactions) {
    const merchant = txn.merchant_normalized || txn.merchant_raw || ''
    const key = `${txn.account_id}|${txn.txn_date}|${txn.amount}|${merchant}`
    const group = seen.get(key) || []
    group.push(txn.id)
    seen.set(key, group)
  }

  for (const [key, ids] of seen) {
    if (ids.length > 1) {
      const [, date, amount, merchant] = key.split('|')
      findings.push({
        type: 'duplicate_transaction',
        severity: 'medium',
        description: `${ids.length} duplicate transactions found: ${merchant || 'Unknown'} for ${amount} on ${date}`,
        table: 'statement_transactions',
        record_id: ids[0],
      })
    }
  }

  return {
    type: 'duplicate_detection',
    status: findings.length === 0 ? 'pass' : 'warning',
    summary: findings.length === 0
      ? `Checked ${transactions.length} transactions — no duplicates found.`
      : `Found ${findings.length} potential duplicate group(s) across ${transactions.length} transactions.`,
    findings,
    recordsChecked: transactions.length,
    issuesFound: findings.length,
  }
}

/**
 * Check 2: Anomaly Detection
 * Flags statement_transactions with unusually high amounts compared to category averages.
 */
export async function checkAnomalies(
  supabase: SupabaseClient,
  userId: string
): Promise<ReconciliationResult> {
  const findings: ReconciliationFinding[] = []
  const accountIds = await getHouseholdAccountIds(supabase, userId)

  if (accountIds.length === 0) {
    return { type: 'anomaly_scan', status: 'pass', summary: 'No data to scan.', findings: [], recordsChecked: 0, issuesFound: 0 }
  }

  const { data: transactions } = await supabase
    .from('statement_transactions')
    .select('id, amount, merchant_normalized, merchant_raw, category_id, txn_date, txn_type')
    .in('account_id', accountIds)
    .eq('txn_type', 'debit')

  if (!transactions || transactions.length < 5) {
    return { type: 'anomaly_scan', status: 'pass', summary: 'Not enough transactions to detect anomalies.', findings: [], recordsChecked: transactions?.length || 0, issuesFound: 0 }
  }

  const byCategory = new Map<string, number[]>()
  for (const txn of transactions) {
    const cat = txn.category_id != null ? String(txn.category_id) : 'uncategorized'
    const amounts = byCategory.get(cat) || []
    amounts.push(Math.abs(txn.amount))
    byCategory.set(cat, amounts)
  }

  for (const txn of transactions) {
    const cat = txn.category_id != null ? String(txn.category_id) : 'uncategorized'
    const amounts = byCategory.get(cat)!
    if (amounts.length < 3) continue

    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const variance = amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length
    const stddev = Math.sqrt(variance)
    const txnAmount = Math.abs(txn.amount)

    if (stddev > 0 && (txnAmount - mean) / stddev > 3) {
      const merchant = txn.merchant_normalized || txn.merchant_raw || 'Unknown'
      findings.push({
        type: 'anomalous_amount',
        severity: txnAmount > mean * 5 ? 'high' : 'medium',
        description: `Transaction "${merchant}" on ${txn.txn_date} for ${txnAmount.toFixed(2)} is unusually high (avg for category: ${mean.toFixed(2)})`,
        table: 'statement_transactions',
        record_id: txn.id,
        expected: mean,
        actual: txnAmount,
      })
    }
  }

  return {
    type: 'anomaly_scan',
    status: findings.length === 0 ? 'pass' : 'warning',
    summary: findings.length === 0
      ? `Scanned ${transactions.length} transactions — no anomalies detected.`
      : `Found ${findings.length} anomalous transaction(s).`,
    findings,
    recordsChecked: transactions.length,
    issuesFound: findings.length,
  }
}

/**
 * Check 3: Unconfirmed AI Data Audit
 * Counts how many quarantined items are still pending review.
 */
export async function checkQuarantineBacklog(
  supabase: SupabaseClient,
  userId: string
): Promise<ReconciliationResult> {
  const { data: pending, count } = await supabase
    .from('data_quarantine')
    .select('id, table_name, reason, severity, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .eq('status', 'pending')

  const pendingCount = count || 0
  const highSeverity = (pending || []).filter(p => p.severity === 'high' || p.severity === 'critical').length

  return {
    type: 'category_audit',
    status: pendingCount === 0 ? 'pass' : highSeverity > 0 ? 'fail' : 'warning',
    summary: pendingCount === 0
      ? 'No pending quarantine items. All AI-generated data has been reviewed.'
      : `${pendingCount} item(s) pending review (${highSeverity} high severity).`,
    findings: (pending || []).map(p => ({
      type: 'pending_quarantine',
      severity: p.severity as 'low' | 'medium' | 'high' | 'critical',
      description: p.reason,
      table: p.table_name,
      record_id: p.id,
    })),
    recordsChecked: pendingCount,
    issuesFound: pendingCount,
  }
}

/**
 * Run all reconciliation checks and save results.
 */
export async function runFullReconciliation(
  supabase: SupabaseClient,
  userId: string
): Promise<ReconciliationResult[]> {
  const results = await Promise.all([
    checkDuplicateTransactions(supabase, userId),
    checkAnomalies(supabase, userId),
    checkQuarantineBacklog(supabase, userId),
  ])

  for (const result of results) {
    await supabase.from('reconciliation_runs').insert({
      user_id: userId,
      type: result.type,
      status: result.status,
      summary: result.summary,
      findings: result.findings,
      records_checked: result.recordsChecked,
      issues_found: result.issuesFound,
    })
  }

  return results
}

/**
 * Creates a transaction signature hash for duplicate detection
 * Based on: account_id + date + amount + description
 */
export function createTransactionSignature(params: {
  account_id: string
  txn_date: string | null
  amount: number
  description: string | null
}): string {
  const parts = [
    params.account_id,
    params.txn_date ?? '',
    params.amount.toString(),
    (params.description ?? '').toLowerCase().trim(),
  ]
  const key = parts.join('|')
  return crypto.createHash('sha256').update(key).digest('hex')
}

/**
 * Checks if a transaction already exists in the database by comparing similar attributes
 * Looks for exact amount + date + account within 2 days to catch duplicates
 */
export async function findExistingTransactionMatch(
  supabase: SupabaseClient,
  params: {
    account_id: string
    txn_date: string | null
    amount: number
    description: string | null
  }
): Promise<boolean> {
  if (!params.txn_date) {
    return false
  }

  try {
    const txnDate = new Date(params.txn_date)
    const dayBefore = new Date(txnDate)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const dayAfter = new Date(txnDate)
    dayAfter.setDate(dayAfter.getDate() + 1)

    const { data, error } = await supabase
      .from('statement_transactions')
      .select('id', { count: 'exact' })
      .eq('account_id', params.account_id)
      .eq('amount', params.amount)
      .gte('txn_date', dayBefore.toISOString().split('T')[0])
      .lte('txn_date', dayAfter.toISOString().split('T')[0])
      .limit(1)

    if (error) {
      console.error('Duplicate check error:', error)
      return false
    }

    return (data?.length ?? 0) > 0
  } catch (err) {
    console.error('Exception in duplicate check:', err)
    return false
  }
}

/**
 * Filters parsed transactions to only include new ones (not duplicates)
 * Used during statement approval to prevent reimporting existing data
 */
export async function filterNewParsedTransactions(
  supabase: SupabaseClient,
  accountId: string,
  transactions: Array<{
    date?: string
    description?: string
    amount?: number
    txn_type?: string
  }>
): Promise<{
  new_count: number
  duplicate_count: number
  new_transactions: Array<{
    date?: string
    description?: string
    amount?: number
    txn_type?: string
  }>
  duplicate_transactions: Array<{
    date?: string
    description?: string
    amount?: number
    txn_type?: string
  }>
}> {
  const new_transactions: typeof transactions = []
  const duplicate_transactions: typeof transactions = []

  for (const txn of transactions) {
    const isExisting = await findExistingTransactionMatch(supabase, {
      account_id: accountId,
      txn_date: txn.date ?? null,
      amount: txn.amount ?? 0,
      description: txn.description ?? null,
    })

    if (isExisting) {
      duplicate_transactions.push(txn)
    } else {
      new_transactions.push(txn)
    }
  }

  return {
    new_count: new_transactions.length,
    duplicate_count: duplicate_transactions.length,
    new_transactions,
    duplicate_transactions,
  }
}
