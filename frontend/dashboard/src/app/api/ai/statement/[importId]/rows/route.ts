import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import * as crypto from 'crypto'
import type { Database } from '@/types/database'
import { rememberMerchantCategory } from '@/lib/knowledge/merchant-categories'
import {
  buildPropagationPreview,
  resolveCategorySelectionForSave,
  type ResolvedCategorySelection,
} from '@/lib/server/statement-propagation'
import { refreshLinkSuggestionsForImport } from '@/lib/statement-linking'

type FileImportUpdate = Database['public']['Tables']['file_imports']['Update']
type ImportStagingRow = Database['public']['Tables']['import_staging']['Row']
type ImportStagingUpdate = Database['public']['Tables']['import_staging']['Update']
type ApprovalLogInsert = Database['public']['Tables']['approval_log']['Insert']

function computeTxnHash(
  accountId: string,
  txnDate: string,
  postingDate: string | undefined,
  amount: number,
  currency: string,
  merchantRaw: string,
  reference: string | undefined,
  rowKey: string,
): string {
  const input = [
    accountId,
    txnDate,
    postingDate ?? '',
    String(amount),
    currency,
    merchantRaw.trim().toLowerCase(),
    reference ?? '',
    rowKey,
  ].join('|')
  return crypto.createHash('sha256').update(input).digest('hex')
}

interface RowUpdate {
  id: string
  fields?: {
    txn_date?: string
    posting_date?: string | null
    merchant_raw?: string
    description?: string | null
    amount?: number
    txn_type?: string
    currency?: string
    reference?: string | null
    review_note?: string | null
    categoryId?: number | null
    newCategoryName?: string | null
    newCategoryGroupName?: string | null
  }
  reviewStatus?: 'approved' | 'rejected' | 'pending'
  applyToRowIds?: string[]
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function applyCategoryToOriginalData(
  originalData: Record<string, unknown>,
  nextCategory: ResolvedCategorySelection | null,
) {
  originalData.categoryId = nextCategory?.id ?? null
  originalData.categoryName = nextCategory?.name ?? null
  originalData.categoryType = nextCategory?.type ?? null
  originalData.categoryGroupName = nextCategory?.group_name ?? null
  originalData.categoryDecisionSource = 'manual_override'
  originalData.categoryConfidence = 1
}

function learnCategoryForRow(
  row: ImportStagingRow,
  merchantName: string,
  originalData: Record<string, unknown>,
  nextCategory: ResolvedCategorySelection | null,
) {
  if (!nextCategory) {
    return
  }

  rememberMerchantCategory({
    merchant: merchantName,
    categoryId: nextCategory.id,
    categoryName: nextCategory.name,
    canonicalMerchantName:
      typeof originalData.merchantCanonicalName === 'string'
        ? originalData.merchantCanonicalName
        : merchantName,
    familyName:
      typeof originalData.similarMerchantKey === 'string' ? originalData.similarMerchantKey : undefined,
    businessType:
      typeof originalData.merchantBusinessType === 'string'
        ? originalData.merchantBusinessType
        : undefined,
    aliases: readStringArray(originalData.merchantAliases),
    confidence: 1,
    decisionSource: 'manual_override',
  })
}

async function updateFileImportCounters(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  importId: string,
) {
  const { data: rows } = await supabase
    .from('import_staging')
    .select('review_status, duplicate_status')
    .eq('file_import_id', importId)

  if (!rows) return

  const fileImportUpdate: FileImportUpdate = {
    approved_rows: rows.filter((row) => row.review_status === 'approved').length,
    rejected_rows: rows.filter((row) => row.review_status === 'rejected').length,
    duplicate_rows: rows.filter((row) => row.duplicate_status !== 'none').length,
    updated_at: new Date().toISOString(),
  }

  await supabase
    .from('file_imports')
    .update(fileImportUpdate)
    .eq('id', importId)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> }
) {
  try {
    const { importId } = await params
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const { data: fileImport } = await supabase
      .from('file_imports')
      .select('id, status')
      .eq('id', importId)
      .eq('household_id', profile.household_id)
      .single()

    if (!fileImport) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    if (fileImport.status !== 'in_review') {
      return NextResponse.json({ error: 'Import is not in review state' }, { status: 400 })
    }

    const body = await request.json()
    const updates: RowUpdate[] = body.updates || []
    const bulkRowIds: string[] = body.rowIds || []
    const bulkStatus = body.reviewStatus as RowUpdate['reviewStatus'] | undefined
    const note: string | undefined = body.note

    const results: { id: string; success: boolean; error?: string }[] = []
    const updatedRowIds = new Set<string>()
    const skippedTargets: Array<{ rowId: string; reason: string }> = []
    let resolvedCategory: ResolvedCategorySelection | null | undefined = undefined

    let shouldRefreshLinks = false

    if (bulkRowIds.length > 0 && bulkStatus) {
      const bulkUpdate: ImportStagingUpdate = {
        review_status: bulkStatus,
        review_note: note || null,
        last_reviewed_by: user.id,
        last_reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: bulkError } = await supabase
        .from('import_staging')
        .update(bulkUpdate)
        .eq('file_import_id', importId)
        .in('id', bulkRowIds)

      if (bulkError) {
        return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 })
      }

      const action = bulkRowIds.length > 1
        ? (bulkStatus === 'approved' ? 'bulk_approve' : 'bulk_reject')
        : (bulkStatus === 'approved' ? 'approve' : 'reject')

      const approvalLog: ApprovalLogInsert = {
        household_id: profile.household_id,
        file_import_id: importId,
        actor_user_id: user.id,
        action,
        new_data: { rowIds: bulkRowIds, reviewStatus: bulkStatus },
        note: note || null,
      }

      await supabase.from('approval_log').insert(approvalLog)
      await updateFileImportCounters(supabase, importId)

      for (const id of bulkRowIds) {
        updatedRowIds.add(id)
        results.push({ id, success: true })
      }
    }

    for (const update of updates) {
      const updateData: ImportStagingUpdate = {
        updated_at: new Date().toISOString(),
        last_reviewed_by: user.id,
        last_reviewed_at: new Date().toISOString(),
      }

      if (update.fields) {
        const {
          categoryId,
          newCategoryName,
          newCategoryGroupName,
          ...stagingFieldUpdates
        } = update.fields
        const linkSensitiveFields = ['txn_date', 'posting_date', 'amount', 'txn_type', 'reference', 'merchant_raw', 'description']
        if (Object.keys(stagingFieldUpdates).some((field) => linkSensitiveFields.includes(field))) {
          shouldRefreshLinks = true
        }
        Object.assign(updateData, stagingFieldUpdates)
        updateData.is_edited = true

        const { data: currentRow } = await supabase
          .from('import_staging')
          .select('*')
          .eq('id', update.id)
          .eq('file_import_id', importId)
          .single()

        if (!currentRow) {
          results.push({ id: update.id, success: false, error: 'Row not found' })
          continue
        }

        const effectiveTxnType = update.fields.txn_type ?? currentRow.txn_type
        const originalData = { ...((currentRow.original_data || {}) as Record<string, unknown>) }

        const nextCategory = await resolveCategorySelectionForSave(
          serviceSupabase,
          categoryId,
          newCategoryName,
          newCategoryGroupName,
          effectiveTxnType,
        )

        if (nextCategory !== undefined) {
          resolvedCategory = nextCategory
          applyCategoryToOriginalData(originalData, nextCategory)

          const merchantForLearning = (update.fields.merchant_raw ?? currentRow.merchant_raw)?.trim()
          if (merchantForLearning) {
            learnCategoryForRow(currentRow, merchantForLearning, originalData, nextCategory)
          }
        } else if (update.fields.merchant_raw && typeof originalData.categoryName === 'string') {
          rememberMerchantCategory({
            merchant: update.fields.merchant_raw,
            categoryId: typeof originalData.categoryId === 'number' ? originalData.categoryId : null,
            categoryName: originalData.categoryName,
            canonicalMerchantName:
              typeof originalData.merchantCanonicalName === 'string'
                ? originalData.merchantCanonicalName
                : update.fields.merchant_raw,
            familyName:
              typeof originalData.similarMerchantKey === 'string' ? originalData.similarMerchantKey : undefined,
            businessType:
              typeof originalData.merchantBusinessType === 'string'
                ? originalData.merchantBusinessType
                : undefined,
            aliases: readStringArray(originalData.merchantAliases),
            confidence: 1,
            decisionSource: 'manual_override',
          })
        }

        updateData.original_data = originalData

        const newHash = computeTxnHash(
          currentRow.account_id,
          (update.fields.txn_date ?? currentRow.txn_date) as string,
          (update.fields.posting_date !== undefined ? update.fields.posting_date : currentRow.posting_date) as string | undefined,
          update.fields.amount ?? Number(currentRow.amount),
          (update.fields.currency ?? currentRow.currency) as string,
          (update.fields.merchant_raw ?? currentRow.merchant_raw) as string,
          (update.fields.reference !== undefined ? update.fields.reference : currentRow.reference) as string | undefined,
          String(currentRow.row_index),
        )
        updateData.txn_hash = newHash

        const { data: existingTxn } = await supabase
          .from('statement_transactions')
          .select('id')
          .eq('account_id', currentRow.account_id)
          .eq('txn_hash', newHash)
          .limit(1)
          .maybeSingle()

        updateData.duplicate_status = existingTxn ? 'existing_final' : 'none'
        updateData.duplicate_transaction_id = existingTxn?.id ?? null

        const { error: updateError } = await supabase
          .from('import_staging')
          .update(updateData)
          .eq('id', update.id)
          .eq('file_import_id', importId)

        if (updateError) {
          results.push({ id: update.id, success: false, error: updateError.message })
          continue
        }

        updatedRowIds.add(update.id)

        const applyToRowIds = Array.isArray(update.applyToRowIds)
          ? Array.from(new Set(update.applyToRowIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
          : []

        if (applyToRowIds.length > 0 && nextCategory !== undefined) {
          const { data: allRelatedRows } = await supabase
            .from('import_staging')
            .select('*')
            .eq('file_import_id', importId)
            .neq('id', update.id)

          const preview = buildPropagationPreview({
            sourceRow: currentRow,
            candidateRows: (allRelatedRows ?? []) as ImportStagingRow[],
            category: nextCategory,
          })

          const allowedTargets = new Map(
            [...preview.preselectedTargets, ...preview.optionalTargets].map((target) => [target.rowId, target]),
          )
          const excludedTargets = new Map(preview.excludedTargets.map((target) => [target.rowId, target]))

          const { data: selectedRows } = await supabase
            .from('import_staging')
            .select('*')
            .eq('file_import_id', importId)
            .in('id', applyToRowIds)

          for (const targetId of applyToRowIds) {
            const selectedRow = (selectedRows ?? []).find((row) => row.id === targetId)
            if (!selectedRow) {
              skippedTargets.push({ rowId: targetId, reason: 'Selected target row was not found.' })
              continue
            }

            const allowedTarget = allowedTargets.get(targetId)
            if (!allowedTarget) {
              skippedTargets.push({
                rowId: targetId,
                reason: excludedTargets.get(targetId)?.reason || 'Selected row is not an eligible related row.',
              })
              continue
            }

            const targetOriginalData = { ...((selectedRow.original_data || {}) as Record<string, unknown>) }
            applyCategoryToOriginalData(targetOriginalData, nextCategory)

            const { error: targetUpdateError } = await supabase
              .from('import_staging')
              .update({
                original_data: targetOriginalData,
                is_edited: true,
                updated_at: new Date().toISOString(),
                last_reviewed_by: user.id,
                last_reviewed_at: new Date().toISOString(),
              })
              .eq('id', selectedRow.id)
              .eq('file_import_id', importId)

            if (targetUpdateError) {
              skippedTargets.push({ rowId: selectedRow.id, reason: targetUpdateError.message })
              continue
            }

            updatedRowIds.add(selectedRow.id)
            learnCategoryForRow(selectedRow, selectedRow.merchant_raw, targetOriginalData, nextCategory)
          }
        }

        const editLog: ApprovalLogInsert = {
          household_id: profile.household_id,
          file_import_id: importId,
          staging_id: update.id,
          actor_user_id: user.id,
          action: 'edit',
          old_data: currentRow as unknown as Record<string, unknown>,
          new_data: {
            ...update.fields,
            categoryId: nextCategory === undefined ? categoryId : nextCategory?.id ?? null,
            createdCategoryId: nextCategory && nextCategory.id !== categoryId ? nextCategory.id : null,
            applyToRowIds,
            skippedTargets,
          },
          note: note || null,
        }

        await supabase.from('approval_log').insert(editLog)
      }

      if (update.reviewStatus) {
        const { error: reviewStatusError } = await supabase
          .from('import_staging')
          .update({
            review_status: update.reviewStatus,
            updated_at: new Date().toISOString(),
            last_reviewed_by: user.id,
            last_reviewed_at: new Date().toISOString(),
          })
          .eq('id', update.id)
          .eq('file_import_id', importId)

        if (reviewStatusError) {
          results.push({ id: update.id, success: false, error: reviewStatusError.message })
          continue
        }
      }

      results.push({ id: update.id, success: true })
    }

    if (updates.length > 0) {
      await updateFileImportCounters(supabase, importId)
    }

    if (shouldRefreshLinks) {
      await refreshLinkSuggestionsForImport({
        supabase: serviceSupabase,
        fileImportId: importId,
        householdId: profile.household_id,
        actorUserId: user.id,
      })
    }

    return NextResponse.json({
      results,
      updatedRowIds: Array.from(updatedRowIds),
      updatedCount: updatedRowIds.size,
      skippedTargets,
      resolvedCategory: resolvedCategory
        ? {
            id: resolvedCategory.id,
            name: resolvedCategory.name,
            type: resolvedCategory.type,
            group_name: resolvedCategory.group_name,
          }
        : resolvedCategory === null
          ? null
          : undefined,
    })
  } catch (error) {
    console.error('Failed to update staging rows:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update rows' },
      { status: 500 }
    )
  }
}
