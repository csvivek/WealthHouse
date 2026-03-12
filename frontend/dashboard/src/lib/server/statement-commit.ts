import { SupabaseClient } from '@supabase/supabase-js'
import { deriveMerchantDisplayName } from '@/lib/merchants/normalization'
import { isMerchantSchemaNotReadyError } from '@/lib/merchants/config'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { logAudit } from '@/lib/integrity/audit'
import { resolveMerchantReference } from '@/lib/server/merchant-service'
import { isStatementLinkingSchemaNotReadyError, statementLinkingSchemaNotReadyWarning } from '@/lib/statement-linking/config'
import type { Database } from '@/types/database'

type FileImportUpdate = Database['public']['Tables']['file_imports']['Update']
type ImportStagingUpdate = Database['public']['Tables']['import_staging']['Update']
type ApprovalLogInsert = Database['public']['Tables']['approval_log']['Insert']
type StatementImportInsert = Database['public']['Tables']['statement_imports']['Insert']
type StatementTransactionInsert = Database['public']['Tables']['statement_transactions']['Insert']
type StatementSummaryInsert = Database['public']['Tables']['statement_summaries']['Insert']
type TransactionLinkInsert = Database['public']['Tables']['transaction_links']['Insert']
type FileImportRow = Database['public']['Tables']['file_imports']['Row']

type ServiceSupabaseClient = SupabaseClient

export interface StatementCommitResult {
  statementImportIds: string[]
  committedCount: number
  skippedDuplicateCount: number
  rejectedCount: number
  status: 'committed'
  replacementCommit: boolean
  warnings: string[]
}

export class StatementCommitProcessError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'StatementCommitProcessError'
    this.status = status
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' ? value : null
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function coerceDateOnly(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

function buildStatementSummaryInsert(params: {
  statementImportId: string
  accountId: string
  fileImport: Pick<FileImportRow, 'statement_date' | 'statement_period_end' | 'statement_period_start'>
  summary: Record<string, unknown>
}) {
  const warnings: string[] = []
  const statementDate =
    coerceDateOnly(params.fileImport.statement_date) ??
    coerceDateOnly(params.fileImport.statement_period_end) ??
    coerceDateOnly(params.fileImport.statement_period_start)

  if (!statementDate) {
    warnings.push('Statement committed, but statement summary was skipped because no valid statement date was available.')
    return { summaryInsert: null, warnings }
  }

  let paymentDueDate = coerceDateOnly(params.summary.payment_due_date)
  if (params.summary.payment_due_date != null && !paymentDueDate) {
    warnings.push('Statement committed, but payment due date was skipped because it was invalid.')
  } else if (paymentDueDate && paymentDueDate <= statementDate) {
    warnings.push('Statement committed, but payment due date was skipped because it was earlier than or equal to the statement date.')
    paymentDueDate = null
  }

  const summaryInsert: StatementSummaryInsert = {
    statement_import_id: params.statementImportId,
    account_id: params.accountId,
    statement_date: statementDate,
    credit_limit: readNumber(params.summary.credit_limit),
    minimum_payment: readNumber(params.summary.minimum_payment),
    payment_due_date: paymentDueDate,
    grand_total: readNumber(params.summary.grand_total),
  }

  return { summaryInsert, warnings }
}

function resolveFinalTxnType(row: { txn_type: string; merchant_raw: string; description: string | null; original_data: Record<string, unknown> }) {
  const statementType = readString(row.original_data.statementType)?.toLowerCase()
  const categoryType = readString(row.original_data.categoryType)?.toLowerCase()
  const merchant = row.merchant_raw.toLowerCase()
  const description = (row.description || '').toLowerCase()
  const haystack = `${merchant} ${description}`

  if (statementType) {
    if (statementType.includes('refund')) return 'refund'
    if (statementType.includes('payment')) return 'payment'
    if (statementType.includes('transfer')) return 'transfer'
    if (statementType.includes('purchase')) return 'purchase'
  }

  if (categoryType === 'transfer') return 'transfer'
  if (haystack.includes('refund')) return 'refund'
  if (haystack.includes('payment') || haystack.includes('internet/wireless') || haystack.includes('bill payment')) return 'payment'
  if (haystack.includes('transfer')) return 'transfer'
  if (String(row.txn_type).toLowerCase() === 'debit') return 'purchase'
  if (String(row.txn_type).toLowerCase() === 'credit') return 'payment'
  return 'unknown'
}

async function rollbackNewCommitState(
  supabase: ServiceSupabaseClient,
  importId: string,
  newStatementImportIds: string[],
  recommittedRowIds: string[],
  targetStatus: FileImportUpdate['status'] = 'in_review',
) {
  if (recommittedRowIds.length > 0) {
    await supabase
      .from('import_staging')
      .update({
        review_status: 'approved',
        committed_transaction_id: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', recommittedRowIds)
  }

  if (newStatementImportIds.length > 0) {
    await supabase.from('statement_transactions').delete().in('statement_import_id', newStatementImportIds)
    await supabase.from('statement_summaries').delete().in('statement_import_id', newStatementImportIds)
    await supabase.from('statement_imports').delete().in('id', newStatementImportIds)
  }

  await supabase
    .from('file_imports')
    .update({
      status: targetStatus,
      committed_statement_import_id: null,
      committed_at: null,
      committed_rows: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', importId)
}

async function deleteCommittedVersion(supabase: ServiceSupabaseClient, statementImportIds: string[]) {
  if (statementImportIds.length === 0) return

  await supabase.from('statement_transactions').delete().in('statement_import_id', statementImportIds)
  await supabase.from('statement_summaries').delete().in('statement_import_id', statementImportIds)
  await supabase.from('statement_imports').delete().in('id', statementImportIds)
}

export async function processStatementCommit(params: {
  importId: string
  householdId: string
  userId: string
}): Promise<StatementCommitResult> {
  const { importId, householdId, userId } = params
  const supabase = createServiceSupabaseClient()
  const warnings: string[] = []

  const { data: fileImport, error: fiError } = await supabase
    .from('file_imports')
    .select('*')
    .eq('id', importId)
    .eq('household_id', householdId)
    .single()

  if (fiError || !fileImport) {
    throw new StatementCommitProcessError('Import not found', 404)
  }

  if (fileImport.status !== 'in_review') {
    throw new StatementCommitProcessError(
      `Import is in "${fileImport.status}" state. Only "in_review" imports can be committed.`,
      400,
    )
  }

  const { data: existingStatementImports, error: existingStatementImportsError } = await supabase
    .from('statement_imports')
    .select('id')
    .eq('file_import_id', importId)

  if (existingStatementImportsError) {
    throw new StatementCommitProcessError('Failed to inspect existing committed statement imports', 500)
  }

  const previousStatementImportIds = (existingStatementImports ?? []).map((row) => row.id)
  const isReplacementCommit = previousStatementImportIds.length > 0

  const committingUpdate: FileImportUpdate = {
    status: 'committing',
    updated_at: new Date().toISOString(),
  }

  await supabase.from('file_imports').update(committingUpdate).eq('id', importId)

  const { data: approvedRows } = await supabase
    .from('import_staging')
    .select('*')
    .eq('file_import_id', importId)
    .eq('review_status', 'approved')
    .order('row_index', { ascending: true })

  if (!approvedRows || approvedRows.length === 0) {
    if (isReplacementCommit) {
      await deleteCommittedVersion(supabase, previousStatementImportIds)
    }

    const emptyCommitUpdate: FileImportUpdate = {
      status: 'committed',
      committed_at: new Date().toISOString(),
      committed_rows: 0,
      committed_statement_import_id: null,
      updated_at: new Date().toISOString(),
    }

    await supabase.from('file_imports').update(emptyCommitUpdate).eq('id', importId)

    return {
      statementImportIds: [],
      committedCount: 0,
      skippedDuplicateCount: 0,
      rejectedCount: fileImport.rejected_rows || 0,
      status: 'committed',
      replacementCommit: isReplacementCommit,
      warnings,
    }
  }

  if (!fileImport.institution_id) {
    await supabase
      .from('file_imports')
      .update({ status: 'in_review', updated_at: new Date().toISOString() })
      .eq('id', importId)

    throw new StatementCommitProcessError('File import is missing an institution_id and cannot be committed.', 400)
  }

  const rowsByAccount = new Map<string, typeof approvedRows>()
  for (const row of approvedRows) {
    const rows = rowsByAccount.get(row.account_id) ?? []
    rows.push(row)
    rowsByAccount.set(row.account_id, rows)
  }

  const statementImportsByAccount = new Map<string, string>()
  const newStatementImportIds: string[] = []
  const recommittedRowIds: string[] = []
  const merchantResolutionCache = new Map<string, Awaited<ReturnType<typeof resolveMerchantReference>>>()

  for (const [accountId, rows] of rowsByAccount.entries()) {
    const firstRow = rows[0]
    const originalData = (firstRow.original_data || {}) as Record<string, unknown>
    const accountLabel = readString(originalData.matchedAccountName)
    const statementImportInsert: StatementImportInsert = {
      account_id: accountId,
      institution_id: fileImport.institution_id,
      file_import_id: fileImport.id,
      statement_period_start: fileImport.statement_period_start,
      statement_period_end: fileImport.statement_period_end,
      statement_name: accountLabel ? `${fileImport.file_name} — ${accountLabel}` : fileImport.file_name,
      source: 'upload',
      parse_status: 'parsed',
      parse_confidence: Number(fileImport.parse_confidence) || 0.85,
    }

    const { data: stmtImport, error: stmtError } = await supabase
      .from('statement_imports')
      .insert(statementImportInsert)
      .select('id')
      .single()

    if (stmtError || !stmtImport) {
      await rollbackNewCommitState(supabase, importId, newStatementImportIds, recommittedRowIds)
      console.error('Failed to create statement import:', stmtError)
      throw new StatementCommitProcessError('Failed to create statement import record', 500)
    }

    statementImportsByAccount.set(accountId, stmtImport.id)
    newStatementImportIds.push(stmtImport.id)
  }

  let committedCount = 0
  let skippedDuplicateCount = 0
  const committedTransactionByStagingId = new Map<string, string>()

  for (const row of approvedRows) {
    const statementImportId = statementImportsByAccount.get(row.account_id)
    if (!statementImportId) continue

    const originalData = (row.original_data || {}) as Record<string, unknown>
    const merchantKey = row.merchant_raw.trim().toLowerCase()
    let merchantResolution = merchantResolutionCache.get(merchantKey)
    if (merchantResolution === undefined) {
      try {
        merchantResolution = row.merchant_raw.trim()
          ? await resolveMerchantReference({
              db: supabase as never,
              householdId,
              rawName: row.merchant_raw,
              sourceType: 'statement',
              actorUserId: userId,
            })
          : null
      } catch (error) {
        if (!isMerchantSchemaNotReadyError(error)) {
          throw error
        }

        merchantResolution = null
      }
      merchantResolutionCache.set(merchantKey, merchantResolution)
    }

    const merchantDisplayName =
      merchantResolution?.merchant.name ??
      deriveMerchantDisplayName(row.merchant_raw) ??
      readString(row.merchant_raw)

    const transactionInsert: StatementTransactionInsert = {
      statement_import_id: statementImportId,
      account_id: row.account_id,
      card_id: readString(originalData.matchedCardId),
      txn_date: row.txn_date,
      posting_date: row.posting_date,
      merchant_raw: row.merchant_raw,
      merchant_id: merchantResolution?.merchant.id ?? null,
      merchant_normalized: merchantDisplayName,
      description: row.description,
      amount: row.amount,
      txn_type: resolveFinalTxnType({
        txn_type: row.txn_type,
        merchant_raw: row.merchant_raw,
        description: row.description,
        original_data: originalData,
      }) as Database['public']['Enums']['txn_type'],
      currency: row.currency,
      original_amount: row.original_amount,
      original_currency: row.original_currency,
      txn_hash: row.txn_hash,
      confidence: Number(row.confidence) || 0.85,
      category_id: readNumber(originalData.categoryId),
    }

    const { data: inserted, error: txnError } = await supabase
      .from('statement_transactions')
      .insert(transactionInsert)
      .select('id')
      .maybeSingle()

    if (txnError) {
      if (txnError.code === '23505') {
        skippedDuplicateCount += 1
        const duplicateUpdate: ImportStagingUpdate = {
          review_status: 'rejected',
          duplicate_status: 'existing_final',
          review_note: 'Duplicate detected at commit time',
          updated_at: new Date().toISOString(),
        }

        await supabase.from('import_staging').update(duplicateUpdate).eq('id', row.id)
        continue
      }

      console.error('Failed to insert transaction:', txnError)
      await rollbackNewCommitState(supabase, importId, newStatementImportIds, recommittedRowIds)
      throw new StatementCommitProcessError(txnError.message || 'Failed to insert committed transactions', 500)
    }

    const committedUpdate: ImportStagingUpdate = {
      review_status: 'committed',
      committed_transaction_id: inserted?.id,
      updated_at: new Date().toISOString(),
    }

    await supabase.from('import_staging').update(committedUpdate).eq('id', row.id)

    if (inserted?.id) {
      committedTransactionByStagingId.set(row.id, inserted.id)
      const tagIds = Array.from(new Set(readStringArray(originalData.tagIds)))
      if (tagIds.length > 0) {
        const { error: tagError } = await supabase.from('statement_transaction_tags').upsert(
          tagIds.map((tagId) => ({
            household_id: householdId,
            statement_transaction_id: inserted.id,
            tag_id: tagId,
            created_by: userId,
          })),
          { onConflict: 'statement_transaction_id,tag_id' },
        )

        if (tagError) {
          console.error('Failed to persist statement tags:', tagError)
          await rollbackNewCommitState(supabase, importId, newStatementImportIds, recommittedRowIds)
          throw new StatementCommitProcessError(tagError.message || 'Failed to persist statement tags', 500)
        }
      }
    }

    recommittedRowIds.push(row.id)
    committedCount += 1
  }

  if (rowsByAccount.size === 1 && fileImport.summary_json && fileImport.card_info_json) {
    const onlyAccountId = Array.from(rowsByAccount.keys())[0]
    const onlyStatementImportId = statementImportsByAccount.get(onlyAccountId)
    const summary = fileImport.summary_json as Record<string, unknown>
    if (onlyStatementImportId) {
      const normalizedSummary = buildStatementSummaryInsert({
        statementImportId: onlyStatementImportId,
        accountId: onlyAccountId,
        fileImport,
        summary,
      })
      warnings.push(...normalizedSummary.warnings)

      if (normalizedSummary.summaryInsert) {
        const { error: summaryError } = await supabase.from('statement_summaries').insert(normalizedSummary.summaryInsert)
        if (summaryError) {
          console.error('Failed to insert statement summary:', summaryError)
          await rollbackNewCommitState(supabase, importId, newStatementImportIds, recommittedRowIds)
          throw new StatementCommitProcessError(summaryError.message || 'Failed to create statement summary', 500)
        }
      }
    }
  }


  const { data: approvedLinks, error: approvedLinksError } = await supabase
    .from('staging_transaction_links')
    .select('*')
    .eq('file_import_id', importId)
    .eq('household_id', householdId)
    .eq('status', 'confirmed')

  if (approvedLinksError) {
    if (isStatementLinkingSchemaNotReadyError(approvedLinksError)) {
      warnings.push(statementLinkingSchemaNotReadyWarning())
    } else {
      await rollbackNewCommitState(supabase, importId, newStatementImportIds, recommittedRowIds)
      throw new StatementCommitProcessError('Failed to load approved staging links', 500)
    }
  }

  const linkInserts: TransactionLinkInsert[] = []

  for (const link of approvedLinks ?? []) {
    const fromTransactionId = committedTransactionByStagingId.get(link.from_staging_id)
    const toTransactionId = link.to_transaction_id ?? (link.to_staging_id ? committedTransactionByStagingId.get(link.to_staging_id) : null)

    if (!fromTransactionId || !toTransactionId || fromTransactionId === toTransactionId) continue

    linkInserts.push({
      from_transaction_id: fromTransactionId,
      to_transaction_id: toTransactionId,
      link_type: link.link_type,
      link_score: Number(link.link_score ?? 0),
      link_reason: link.link_reason ?? {},
      status: link.status,
      matched_by: link.matched_by ?? 'system',
      matched_by_user_id: link.matched_by_user_id,
      reviewed_by: link.reviewed_by,
      reviewed_at: link.reviewed_at,
    })
  }

  if (linkInserts.length > 0) {
    const { error: linkInsertError } = await supabase
      .from('transaction_links')
      .upsert(linkInserts, { onConflict: 'from_transaction_id,to_transaction_id,link_type' })

    if (linkInsertError) {
      if (isStatementLinkingSchemaNotReadyError(linkInsertError, 'transaction_links')) {
        warnings.push(statementLinkingSchemaNotReadyWarning())
      } else {
        await rollbackNewCommitState(supabase, importId, newStatementImportIds, recommittedRowIds)
        throw new StatementCommitProcessError(linkInsertError.message || 'Failed to persist transaction links', 500)
      }
    }
  }

  if (isReplacementCommit) {
    await deleteCommittedVersion(supabase, previousStatementImportIds)
  }

  const rejectedCount = (
    await supabase
      .from('import_staging')
      .select('id', { count: 'exact' })
      .eq('file_import_id', importId)
      .eq('review_status', 'rejected')
  ).count || 0

  const statementImportIds = Array.from(statementImportsByAccount.values())
  const committedImportUpdate: FileImportUpdate = {
    status: 'committed',
    committed_statement_import_id: statementImportIds[0] ?? null,
    committed_at: new Date().toISOString(),
    committed_rows: committedCount,
    rejected_rows: rejectedCount,
    updated_at: new Date().toISOString(),
  }

  await supabase.from('file_imports').update(committedImportUpdate).eq('id', importId)

  const approvalLog: ApprovalLogInsert = {
    household_id: householdId,
    file_import_id: importId,
    actor_user_id: userId,
    action: 'commit',
    new_data: {
      committedCount,
      skippedDuplicateCount,
      rejectedCount,
      statementImportIds,
      replacementCommit: isReplacementCommit,
      replacedStatementImportIds: previousStatementImportIds,
      warnings,
    },
  }

  await supabase.from('approval_log').insert(approvalLog)

  await logAudit(supabase, {
    table_name: 'statement_imports',
    record_id: statementImportIds[0] ?? fileImport.id,
    action: 'insert',
    new_data: {
      institution_code: fileImport.institution_code,
      transactions_count: committedCount,
      statement_date: fileImport.statement_date,
      file_import_id: importId,
      statement_import_ids: statementImportIds,
      replacement_commit: isReplacementCommit,
      warnings,
    },
    source: 'statement_import',
    user_id: userId,
  })

  return {
    statementImportIds,
    committedCount,
    skippedDuplicateCount,
    rejectedCount,
    status: 'committed',
    replacementCommit: isReplacementCommit,
    warnings,
  }
}
