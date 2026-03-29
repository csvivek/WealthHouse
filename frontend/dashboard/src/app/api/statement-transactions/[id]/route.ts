import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { getAuthenticatedHouseholdContext } from '@/lib/server/household-context'
import { isApprovedMappingStatus, withApprovedMappingStatusFallback } from '@/lib/statement-linking/config'
import { replaceTagsOnStatementTransaction, validateTagOwnership } from '@/lib/server/tag-service'
import { isPaymentCategoryTypeCompatible, normalizeTxnDirection } from '@/lib/transactions/category-compatibility'
import {
  buildInternalTransferLinkSummary,
  getInternalTransferCounterpartId,
  resolveTransferCategoryLinkType,
  type InternalTransferLinkRecord,
  type InternalTransferTransactionLike,
} from '@/lib/transactions/internal-transfer-links'

const SUPPORTED_TRANSFER_LINK_TYPES = ['internal_transfer', 'credit_card_payment', 'loan_repayment'] as const

type SupportedTransferLinkType = typeof SUPPORTED_TRANSFER_LINK_TYPES[number]

interface CategoryResponse {
  id: number
  name: string
  type: string | null
  group_id: number | null
  subgroup_id: number | null
  icon_key: string | null
  color_token: string | null
  color_hex: string | null
  domain_type: string | null
  payment_subtype: string | null
  category_group: { id: number; name: string } | null
  category_subgroup: { id: number; name: string; group_id: number } | null
}

interface TagResponse {
  id?: string | null
  name: string
  color_token?: string | null
  color_hex?: string | null
  icon_key?: string | null
  source?: string | null
}

interface StatementTransactionAccessRow {
  id: string
  txn_type: string
  amount: number
  category_id: number | null
  account_id: string
}

interface AccountResponse {
  id: string
  product_name: string | null
  nickname: string | null
}

interface StatementTransactionSummaryResponse {
  id: string
  txn_type: string
  txn_date: string
  amount: number
  merchant_normalized: string | null
  merchant_raw: string | null
  description: string | null
  account_id: string
  account: AccountResponse | AccountResponse[] | null
}

interface StatementTransactionEditorResponse extends StatementTransactionSummaryResponse {
  category_id: number | null
  category: CategoryResponse | null
  statement_transaction_tags: unknown
}

function isSupportedTransferLinkType(value: unknown): value is SupportedTransferLinkType {
  return typeof value === 'string' && SUPPORTED_TRANSFER_LINK_TYPES.includes(value as SupportedTransferLinkType)
}

function isTransferCategory(category: CategoryResponse | null) {
  const categoryType = category?.type ?? category?.payment_subtype
  return categoryType === 'transfer'
}

class RouteError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function readErrorMessage(error: unknown, fallback = 'Failed to update transaction') {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? fallback)
  }
  return fallback
}

function flattenTags(value: unknown): TagResponse[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const rawTag = (entry as { tag?: unknown }).tag
    const tags = Array.isArray(rawTag) ? rawTag : rawTag ? [rawTag] : []
    return tags.filter((tag): tag is TagResponse => {
      if (!tag || typeof tag !== 'object') return false
      if (typeof (tag as TagResponse).name !== 'string') return false
      return (tag as { is_active?: boolean }).is_active !== false
    })
  })
}

async function getStatementTransactionForHousehold(
  db: ReturnType<typeof createServiceSupabaseClient>,
  householdId: string,
  transactionId: string,
) {
  const { data: transaction, error: transactionError } = await db
    .from('statement_transactions')
    .select('id, txn_type, amount, category_id, account_id')
    .eq('id', transactionId)
    .maybeSingle()

  if (transactionError) throw new Error(transactionError.message)
  if (!transaction) return null

  const { data: account, error: accountError } = await db
    .from('accounts')
    .select('household_id')
    .eq('id', transaction.account_id)
    .maybeSingle()

  if (accountError) throw new Error(accountError.message)
  if (!account || account.household_id !== householdId) return null

  return transaction as StatementTransactionAccessRow
}

async function getPaymentCategory(
  db: ReturnType<typeof createServiceSupabaseClient>,
  categoryId: number,
) {
  const { data, error } = await db
    .from('categories')
    .select('id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)')
    .eq('id', categoryId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as CategoryResponse | null) ?? null
}

async function getStatementTransactionSummary(
  db: ReturnType<typeof createServiceSupabaseClient>,
  transactionId: string,
) {
  const { data, error } = await db
    .from('statement_transactions')
    .select('id, txn_type, txn_date, amount, merchant_normalized, merchant_raw, description, account_id, account:accounts(id, product_name, nickname)')
    .eq('id', transactionId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as unknown as StatementTransactionSummaryResponse | null) ?? null
}

async function getStatementTransactionEditorState(
  db: ReturnType<typeof createServiceSupabaseClient>,
  transactionId: string,
) {
  const { data, error } = await db
    .from('statement_transactions')
    .select('id, txn_type, txn_date, amount, merchant_normalized, merchant_raw, description, account_id, account:accounts(id, product_name, nickname), category_id, category:categories(id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)), statement_transaction_tags(tag:tags(id, name, color_token, color_hex, icon_key, source, is_active))')
    .eq('id', transactionId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Transaction not found.')

  const row = data as unknown as StatementTransactionEditorResponse
  const links = await getTransferLinksForTransaction(db, transactionId)
  const counterpartId = links
    .map((link) => getInternalTransferCounterpartId(transactionId, link))
    .find((value): value is string => Boolean(value))

  let internalTransferLink = null
  if (counterpartId) {
    const counterpart = await getStatementTransactionSummary(db, counterpartId)
    if (counterpart) {
      internalTransferLink = buildInternalTransferLinkSummary({
        sourceTransaction: toInternalTransferTransaction(row),
        counterpartTransaction: toInternalTransferTransaction(counterpart),
        counterpartAccountName: getAccountDisplayName(counterpart.account),
      })
    }
  }

  return {
    id: String(row.id),
    categoryId: typeof row.category_id === 'number' ? row.category_id : null,
    category: row.category ?? null,
    tags: flattenTags(row.statement_transaction_tags),
    internalTransferLink,
  }
}

async function getTransferLinksForTransaction(
  db: ReturnType<typeof createServiceSupabaseClient>,
  transactionId: string,
) {
  const [outgoingResult, incomingResult] = await Promise.all([
    db
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status, transfer_chain_id, allocated_amount')
      .eq('from_transaction_id', transactionId),
    db
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status, transfer_chain_id, allocated_amount')
      .eq('to_transaction_id', transactionId),
  ])

  if (outgoingResult.error) throw new Error(outgoingResult.error.message)
  if (incomingResult.error) throw new Error(incomingResult.error.message)

  return dedupeInternalTransferLinks([
    ...normalizeInternalTransferLinks(outgoingResult.data).filter((link) => isApprovedMappingStatus(link.status)),
    ...normalizeInternalTransferLinks(incomingResult.data).filter((link) => isApprovedMappingStatus(link.status)),
  ])
}

async function deleteInternalTransferLinksForTransaction(
  db: ReturnType<typeof createServiceSupabaseClient>,
  transactionId: string,
) {
  const deletes = SUPPORTED_TRANSFER_LINK_TYPES.flatMap((linkType) => ([
    db
      .from('transaction_links')
      .delete()
      .eq('link_type', linkType)
      .eq('from_transaction_id', transactionId),
    db
      .from('transaction_links')
      .delete()
      .eq('link_type', linkType)
      .eq('to_transaction_id', transactionId),
  ]))

  const results = await Promise.all(deletes)
  const firstError = results.find((result) => result.error)?.error
  if (firstError) throw new Error(firstError.message)
}

async function updateTransferChainIdForLinks(
  db: ReturnType<typeof createServiceSupabaseClient>,
  linkIds: string[],
  transferChainId: string,
) {
  if (linkIds.length === 0) return

  const { error } = await db
    .from('transaction_links')
    .update({ transfer_chain_id: transferChainId })
    .in('id', linkIds)

  if (error) throw new Error(error.message)
}

function normalizeInternalTransferLinks(value: unknown): InternalTransferLinkRecord[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return []

    const link = row as Record<string, unknown>
    if (typeof link.from_transaction_id !== 'string' || typeof link.to_transaction_id !== 'string') return []

    return [{
      id: typeof link.id === 'string' ? link.id : null,
      fromTransactionId: link.from_transaction_id,
      toTransactionId: link.to_transaction_id,
      linkType: typeof link.link_type === 'string' ? link.link_type : null,
      status: typeof link.status === 'string' ? link.status : null,
      transferChainId: typeof link.transfer_chain_id === 'string' ? link.transfer_chain_id : null,
      allocatedAmount: typeof link.allocated_amount === 'number'
        ? link.allocated_amount
        : typeof link.allocated_amount === 'string'
          ? Number(link.allocated_amount)
          : null,
    }]
  })
}

function dedupeInternalTransferLinks(links: InternalTransferLinkRecord[]) {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = link.id ?? `${link.fromTransactionId}:${link.toTransactionId}:${link.linkType ?? 'internal_transfer'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getAccountDisplayName(account: AccountResponse | AccountResponse[] | null) {
  if (!account) return null
  const row = Array.isArray(account) ? account[0] ?? null : account
  if (!row) return null
  return row.nickname ?? row.product_name ?? null
}

function toInternalTransferTransaction(
  transaction: StatementTransactionSummaryResponse | StatementTransactionEditorResponse,
): InternalTransferTransactionLike {
  return {
    id: transaction.id,
    accountId: transaction.account_id,
    txnType: transaction.txn_type,
    txnDate: transaction.txn_date,
    amount: Number(transaction.amount),
    merchantNormalized: transaction.merchant_normalized,
    merchantRaw: transaction.merchant_raw,
    description: transaction.description,
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthenticatedHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json().catch(() => null)
    const rawTagIds = body?.tagIds
    const rawCategoryId = body?.categoryId
    const rawInternalTransferTargetId = body?.internalTransferTargetId
    const rawTransferLinkType = body?.transferLinkType

    if (!Array.isArray(rawTagIds) || !rawTagIds.every((value) => typeof value === 'string')) {
      return NextResponse.json({ error: 'tagIds must be an array of strings.' }, { status: 400 })
    }

    if (rawCategoryId !== null && !(typeof rawCategoryId === 'number' && Number.isInteger(rawCategoryId))) {
      return NextResponse.json({ error: 'categoryId must be a number or null.' }, { status: 400 })
    }

    if (
      rawInternalTransferTargetId !== undefined &&
      rawInternalTransferTargetId !== null &&
      typeof rawInternalTransferTargetId !== 'string'
    ) {
      return NextResponse.json({ error: 'internalTransferTargetId must be a string or null.' }, { status: 400 })
    }

    if (
      rawTransferLinkType !== undefined &&
      rawTransferLinkType !== null &&
      !isSupportedTransferLinkType(rawTransferLinkType)
    ) {
      return NextResponse.json({ error: 'transferLinkType must be a supported transfer link type or null.' }, { status: 400 })
    }

    const tagIds = rawTagIds as string[]
    const categoryId = rawCategoryId as number | null
    const internalTransferTargetId = typeof rawInternalTransferTargetId === 'string'
      ? rawInternalTransferTargetId
      : null
    const requestedTransferLinkType = isSupportedTransferLinkType(rawTransferLinkType)
      ? rawTransferLinkType
      : null
    const db = createServiceSupabaseClient()
    const transaction = await getStatementTransactionForHousehold(db, ctx.householdId, id)

    if (!transaction) {
      throw new RouteError(404, 'Transaction not found.')
    }

    await validateTagOwnership(db, ctx.householdId, tagIds)

    let category: CategoryResponse | null = null
    if (categoryId !== null) {
      category = await getPaymentCategory(db, categoryId)
      if (!category) {
        throw new RouteError(400, 'Category not found.')
      }

      if (!isPaymentCategoryTypeCompatible(category.type ?? category.payment_subtype, transaction.txn_type)) {
        throw new RouteError(400, 'Category is incompatible with this transaction direction.')
      }
    }

    const wantsTransferLink = internalTransferTargetId !== null
    const transferCategoryLinkType = resolveTransferCategoryLinkType(category?.name)
    const resolvedTransferLinkType = requestedTransferLinkType ?? transferCategoryLinkType ?? 'internal_transfer'
    const categorySupportsTransferLinking = isTransferCategory(category)

    if (wantsTransferLink && !categorySupportsTransferLinking) {
      throw new RouteError(400, 'Counterpart selection is only available for transfer categories.')
    }

    let nextTransferChainId: string | null = null
    let nextAllocatedAmount: number | null = null

    if (internalTransferTargetId) {
      if (internalTransferTargetId === id) {
        throw new RouteError(400, 'A transaction cannot link to itself.')
      }

      const targetTransaction = await getStatementTransactionForHousehold(db, ctx.householdId, internalTransferTargetId)
      if (!targetTransaction) {
        throw new RouteError(404, 'Transfer counterpart transaction not found.')
      }

      if (targetTransaction.account_id === transaction.account_id) {
        throw new RouteError(400, 'Transfer counterpart must be on a different account.')
      }

      if (normalizeTxnDirection(targetTransaction.txn_type) === normalizeTxnDirection(transaction.txn_type)) {
        throw new RouteError(400, 'Transfer counterpart must have the opposite direction.')
      }

      const [sourceLinks, targetLinks] = await Promise.all([
        getTransferLinksForTransaction(db, id),
        getTransferLinksForTransaction(db, internalTransferTargetId),
      ])

      const existingChainIds = Array.from(new Set(
        [...sourceLinks, ...targetLinks]
          .map((link) => link.transferChainId ?? null)
          .filter((value): value is string => Boolean(value)),
      ))

      if (existingChainIds.length > 1) {
        throw new RouteError(400, 'Transactions belong to different transfer chains.')
      }

      nextTransferChainId = existingChainIds[0] ?? null
      if (!nextTransferChainId && (sourceLinks.length > 0 || targetLinks.length > 0)) {
        nextTransferChainId = crypto.randomUUID()
      }

      if (nextTransferChainId) {
        const linkIdsToPromote = Array.from(new Set(
          [...sourceLinks, ...targetLinks]
            .filter((link) => link.id && !link.transferChainId)
            .map((link) => String(link.id)),
        ))
        await updateTransferChainIdForLinks(db, linkIdsToPromote, nextTransferChainId)

        for (const link of [...sourceLinks, ...targetLinks]) {
          if (link.id && linkIdsToPromote.includes(String(link.id))) {
            link.transferChainId = nextTransferChainId
          }
        }
      }

      const targetLinkedElsewhere = targetLinks.some((link) => {
        const counterpartId = getInternalTransferCounterpartId(internalTransferTargetId, link)
        if (counterpartId === null || counterpartId === id) return false

        const sameType = link.linkType === resolvedTransferLinkType
        const sameChain = (link.transferChainId ?? null) === (nextTransferChainId ?? null)
        return sameType && sameChain
      })

      if (targetLinkedElsewhere) {
        throw new RouteError(400, 'Transfer counterpart is already linked to another transfer link.')
      }

      if (transaction.amount == null || targetTransaction.amount == null) {
        throw new RouteError(400, 'Both transactions must have valid amounts to link as transfers.')
      }
      const txnAbs = Math.abs(Number(transaction.amount))
      const targetAbs = Math.abs(Number(targetTransaction.amount))
      const amountDelta = Math.abs(txnAbs - targetAbs)
      nextAllocatedAmount = amountDelta <= 0.01
        ? null
        : Number(Math.min(txnAbs, targetAbs).toFixed(2))
    }

    const { error: updateError } = await db
      .from('statement_transactions')
      .update({ category_id: categoryId })
      .eq('id', id)

    if (updateError) throw new Error(updateError.message)

    await replaceTagsOnStatementTransaction({
      db,
      householdId: ctx.householdId,
      transactionId: id,
      tagIds,
      actorUserId: ctx.userId,
    })

    await deleteInternalTransferLinksForTransaction(db, id)

    if (internalTransferTargetId && categorySupportsTransferLinking) {
      const { error: insertError } = await withApprovedMappingStatusFallback((approvedStatus) => (
        db
          .from('transaction_links')
          .insert({
            from_transaction_id: id,
            to_transaction_id: internalTransferTargetId,
            link_type: resolvedTransferLinkType as Database['public']['Enums']['link_type'],
            link_score: 1,
            link_reason: { source: 'transactions_editor' },
            transfer_chain_id: nextTransferChainId,
            allocated_amount: nextAllocatedAmount,
            status: approvedStatus,
            matched_by: 'user',
            matched_by_user_id: ctx.userId,
          })
      ))

      if (insertError) throw new Error(readErrorMessage(insertError))
    }

    const nextTransaction = await getStatementTransactionEditorState(db, id)
    return NextResponse.json({ success: true, transaction: nextTransaction })
  } catch (error) {
    const status = error instanceof RouteError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Failed to update transaction'
    return NextResponse.json({ error: message }, { status })
  }
}
