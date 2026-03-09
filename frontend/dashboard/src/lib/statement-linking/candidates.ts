import type { Database } from '@/types/database'
import type { LinkCandidate } from './types'

type StagingRow = Database['public']['Tables']['import_staging']['Row']
type StatementTransactionRow = Database['public']['Tables']['statement_transactions']['Row']

export function buildStagingCandidatePairs(params: {
  source: StagingRow
  stagingRows: StagingRow[]
  committedRows: StatementTransactionRow[]
  accountTypeById: Map<string, string>
}) {
  const { source, stagingRows, committedRows, accountTypeById } = params

  const sourceDescription = `${source.merchant_raw || ''} ${source.description || ''}`.trim()

  const pairs: LinkCandidate[] = []

  for (const row of stagingRows) {
    if (row.id === source.id) continue
    pairs.push({
      sourceKind: 'staging',
      sourceId: source.id,
      sourceAccountId: source.account_id,
      sourceAccountType: accountTypeById.get(source.account_id) ?? null,
      sourceTxnDate: source.txn_date,
      sourceAmount: Number(source.amount),
      sourceTxnType: source.txn_type,
      sourceDescription,
      sourceReference: source.reference,
      targetKind: 'staging',
      targetId: row.id,
      targetAccountId: row.account_id,
      targetAccountType: accountTypeById.get(row.account_id) ?? null,
      targetTxnDate: row.txn_date,
      targetAmount: Number(row.amount),
      targetTxnType: row.txn_type,
      targetDescription: `${row.merchant_raw || ''} ${row.description || ''}`.trim(),
      targetReference: row.reference,
    })
  }

  for (const row of committedRows) {
    pairs.push({
      sourceKind: 'staging',
      sourceId: source.id,
      sourceAccountId: source.account_id,
      sourceAccountType: accountTypeById.get(source.account_id) ?? null,
      sourceTxnDate: source.txn_date,
      sourceAmount: Number(source.amount),
      sourceTxnType: source.txn_type,
      sourceDescription,
      sourceReference: source.reference,
      targetKind: 'committed',
      targetId: row.id,
      targetAccountId: row.account_id,
      targetAccountType: accountTypeById.get(row.account_id) ?? null,
      targetTxnDate: row.txn_date,
      targetAmount: Number(row.amount),
      targetTxnType: row.txn_type,
      targetDescription: `${row.merchant_raw || ''} ${row.description || ''}`.trim(),
      targetReference: null,
    })
  }

  return pairs
}
