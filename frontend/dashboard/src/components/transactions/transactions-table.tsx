'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CreditCard,
  Landmark,
  Loader2,
  ScrollText,
  Search,
  Shapes,
  Tags,
  Wallet,
  X,
} from 'lucide-react'
import { ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { EmptyState } from '@/components/empty-state'
import { CategoryIcon } from '@/components/category-icon'
import { InstitutionIcon } from '@/components/institution-icon'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { TagSelector } from '@/components/tag-selector'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatCurrency, formatDate, formatDateShort } from '@/lib/format'
import { classifyLinkType } from '@/lib/statement-linking/effect'
import type { LinkCandidate } from '@/lib/statement-linking/types'
import { createClient } from '@/lib/supabase/client'
import { isApprovedMappingStatus } from '@/lib/statement-linking/config'
import {
  buildInternalTransferLinkSummary,
  compareInternalTransferCandidates,
  hasExactTransferCandidateAmount,
  getTransferLinkLabel,
  isTransferCandidateWithinPastDays,
  resolveTransferCategoryLinkType,
  type InternalTransferLinkRecord,
  type InternalTransferLinkSummary,
  type InternalTransferTransactionLike,
} from '@/lib/transactions/internal-transfer-links'
import {
  getTransactionLedgerView,
  groupTransactionsByTransferChain,
  type TransferChainGroup,
  type TransactionLedgerView,
} from '@/lib/transactions/transaction-chains'
import { isPaymentCategoryTypeCompatible, normalizeTxnDirection } from '@/lib/transactions/category-compatibility'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type ViewMode = 'all' | 'spending' | 'cash_flow'
type EditorFocusTarget = 'category' | 'tags'

function getDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function getDateRangeStart(range: string, customStart: string) {
  const now = new Date()
  switch (range) {
    case 'all_time':
      return null
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
    case '90_days':
      return getDaysAgo(90)
    case 'custom':
      return customStart || null
    default:
      return null
  }
}

function getDateRangeEnd(range: string, customEnd: string) {
  if (range === 'all_time') return null
  if (range === 'last_month') {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
  }
  if (range === 'custom') return customEnd || null
  return new Date().toISOString().split('T')[0]
}

interface CategoryWithHierarchy {
  id: number
  name: string
  type: 'income' | 'expense' | 'transfer' | null
  ledger_view: TransactionLedgerView
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

interface AccountInfo {
  id: string
  product_name: string
  nickname: string | null
  account_type: string | null
  institutions?: {
    name: string | null
    website_url?: string | null
    icon_url?: string | null
  } | Array<{
    name: string | null
    website_url?: string | null
    icon_url?: string | null
  }> | null
}

interface StatementTxn {
  id: string
  txn_date: string
  amount: number
  txn_type: string
  merchant_normalized: string | null
  merchant_raw: string | null
  description: string | null
  category_id: number | null
  account_id: string
  confidence: number
  category: CategoryWithHierarchy | null
  tags: TagPresentation[]
  internalTransferLink: InternalTransferLinkSummary | null
}

function flattenTags(value: unknown): TagPresentation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const rawTag = (entry as { tag?: unknown }).tag
    const tags = Array.isArray(rawTag) ? rawTag : rawTag ? [rawTag] : []
    return tags.filter((tag): tag is TagPresentation => Boolean(tag) && typeof tag === 'object' && typeof (tag as TagPresentation).name === 'string')
  })
}

function normalizeTransferLinks(value: unknown): InternalTransferLinkRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    if (typeof row.from_transaction_id !== 'string' || typeof row.to_transaction_id !== 'string') return []

    return [{
      id: typeof row.id === 'string' ? row.id : null,
      fromTransactionId: row.from_transaction_id,
      toTransactionId: row.to_transaction_id,
      linkType: typeof row.link_type === 'string' ? row.link_type : null,
      status: typeof row.status === 'string' ? row.status : null,
      transferChainId: typeof row.transfer_chain_id === 'string' ? row.transfer_chain_id : null,
      allocatedAmount: typeof row.allocated_amount === 'number'
        ? row.allocated_amount
        : typeof row.allocated_amount === 'string'
          ? Number(row.allocated_amount)
          : null,
    }]
  })
}

function dedupeTransferLinks(links: InternalTransferLinkRecord[]) {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = link.id ?? `${link.fromTransactionId}:${link.toTransactionId}:${link.linkType ?? 'internal_transfer'}:${link.transferChainId ?? 'none'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getGroupedEditorCategories(categories: CategoryWithHierarchy[]) {
  const typeOrder: Array<NonNullable<CategoryWithHierarchy['type']>> = ['income', 'expense', 'transfer']
  const typeLabels: Record<NonNullable<CategoryWithHierarchy['type']>, string> = {
    income: 'Income Categories',
    expense: 'Expense Categories',
    transfer: 'Transfer Categories',
  }

  return typeOrder.map((type) => {
    const categoriesForType = categories
      .filter((category) => (category.type ?? category.payment_subtype ?? 'expense') === type)
      .sort((left, right) => {
        const groupCompare = (left.category_group?.name ?? 'Ungrouped').localeCompare(right.category_group?.name ?? 'Ungrouped')
        return groupCompare !== 0 ? groupCompare : left.name.localeCompare(right.name)
      })

    const grouped = new Map<string, CategoryWithHierarchy[]>()
    for (const category of categoriesForType) {
      const groupName = category.category_group?.name ?? 'Ungrouped'
      grouped.set(groupName, [...(grouped.get(groupName) ?? []), category])
    }

    return {
      type,
      label: typeLabels[type],
      groups: Array.from(grouped.entries()),
    }
  }).filter((group) => group.groups.length > 0)
}

function toInternalTransferTransaction(txn: StatementTxn): InternalTransferTransactionLike {
  return {
    id: txn.id,
    accountId: txn.account_id,
    txnType: txn.txn_type,
    txnDate: txn.txn_date,
    amount: txn.amount,
    merchantNormalized: txn.merchant_normalized,
    merchantRaw: txn.merchant_raw,
    description: txn.description,
  }
}

function getAccountName(account: AccountInfo | undefined) {
  return account?.nickname ?? account?.product_name ?? null
}

function getAccountInstitution(account?: AccountInfo) {
  if (!account?.institutions) return null
  return Array.isArray(account.institutions) ? account.institutions[0] ?? null : account.institutions
}

function buildLinkCandidate(
  source: StatementTxn,
  target: StatementTxn,
  accountsById: Record<string, AccountInfo>,
): LinkCandidate {
  return {
    sourceKind: 'committed',
    sourceId: source.id,
    sourceAccountId: source.account_id,
    sourceAccountType: accountsById[source.account_id]?.account_type ?? null,
    sourceTxnDate: source.txn_date,
    sourceAmount: Number(source.amount),
    sourceTxnType: source.txn_type,
    sourceDescription: `${source.merchant_normalized ?? source.merchant_raw ?? ''} ${source.description ?? ''}`.trim(),
    sourceReference: null,
    targetKind: 'committed',
    targetId: target.id,
    targetAccountId: target.account_id,
    targetAccountType: accountsById[target.account_id]?.account_type ?? null,
    targetTxnDate: target.txn_date,
    targetAmount: Number(target.amount),
    targetTxnType: target.txn_type,
    targetDescription: `${target.merchant_normalized ?? target.merchant_raw ?? ''} ${target.description ?? ''}`.trim(),
    targetReference: null,
  }
}

function hydrateTransactions(
  baseTransactions: StatementTxn[],
  transferLinks: InternalTransferLinkRecord[],
  accounts: AccountInfo[],
) {
  const transactionMap = Object.fromEntries(baseTransactions.map((txn) => [txn.id, toInternalTransferTransaction(txn)]))
  const accountMap = Object.fromEntries(accounts.map((account) => [account.id, { id: account.id, name: getAccountName(account) }]))

  return baseTransactions.map((txn) => ({
    ...txn,
    internalTransferLink: buildResolvedInternalTransferLink(txn.id, transactionMap, accountMap, transferLinks),
  }))
}

function buildResolvedInternalTransferLink(
  transactionId: string,
  transactionsById: Record<string, InternalTransferTransactionLike>,
  accountsById: Record<string, { id: string; name: string | null }>,
  transferLinks: InternalTransferLinkRecord[],
) {
  const sourceTransaction = transactionsById[transactionId]
  if (!sourceTransaction) return null

  const link = transferLinks.find((candidate) => candidate.fromTransactionId === transactionId || candidate.toTransactionId === transactionId)
  if (!link) return null

  const counterpartId = link.fromTransactionId === transactionId ? link.toTransactionId : link.fromTransactionId
  const counterpartTransaction = transactionsById[counterpartId]
  if (!counterpartTransaction) return null

  return buildInternalTransferLinkSummary({
    sourceTransaction,
    counterpartTransaction,
    counterpartAccountName: accountsById[counterpartTransaction.accountId]?.name ?? null,
  })
}

async function loadTransferLinks(
  supabase: ReturnType<typeof createClient>,
  transactionIds: string[],
) {
  if (transactionIds.length === 0) return []

  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status, transfer_chain_id, allocated_amount')
      .in('from_transaction_id', transactionIds),
    supabase
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status, transfer_chain_id, allocated_amount')
      .in('to_transaction_id', transactionIds),
  ])

  if (outgoingResult.error) throw new Error(outgoingResult.error.message)
  if (incomingResult.error) throw new Error(incomingResult.error.message)

  return dedupeTransferLinks([
    ...normalizeTransferLinks(outgoingResult.data).filter((link) => isApprovedMappingStatus(link.status)),
    ...normalizeTransferLinks(incomingResult.data).filter((link) => isApprovedMappingStatus(link.status)),
  ])
}

function getViewLedgerLabel(viewMode: ViewMode) {
  switch (viewMode) {
    case 'spending':
      return 'spending'
    case 'cash_flow':
      return 'cash flow'
    default:
      return 'all activity'
  }
}

function getRolePresentation(role: 'origin' | 'passthrough' | 'terminal') {
  switch (role) {
    case 'origin':
      return { glyph: '→', label: 'Origin', className: 'border-sky-500/30 bg-sky-500/10 text-sky-300' }
    case 'passthrough':
      return { glyph: '⇌', label: 'Pass-through', className: 'border-amber-500/30 bg-amber-500/10 text-amber-200' }
    case 'terminal':
      return { glyph: '✓', label: 'Terminal', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' }
  }
}

// ─── Metric card ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-card/75 p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

// ─── Account pill (compact) ──────────────────────────────────────────────────

function AccountPill({ account }: { account?: AccountInfo }) {
  if (!account) {
    return <Badge variant="outline">Unknown account</Badge>
  }

  const Icon = account.account_type === 'credit_card'
    ? CreditCard
    : account.account_type === 'loan'
      ? ScrollText
      : account.account_type === 'current'
        ? Wallet
        : Landmark

  return (
    <Badge variant="outline" className="gap-1.5 rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-xs text-foreground/90">
      <InstitutionIcon
        iconUrl={getAccountInstitution(account)?.icon_url}
        alt={`${getAccountInstitution(account)?.name ?? getAccountName(account) ?? 'Account'} icon`}
        className="size-4 rounded-full bg-background"
        fallbackIcon={Icon}
        fallbackClassName="size-3.5 text-primary"
      />
      <span>{getAccountName(account)}</span>
    </Badge>
  )
}

// ─── Amount text ─────────────────────────────────────────────────────────────

function AmountText({ amount, txnType }: { amount: number; txnType: string }) {
  const isCredit = normalizeTxnDirection(txnType) === 'credit'
  return (
    <span className={cn('font-mono text-sm font-semibold', isCredit ? 'text-emerald-300' : 'text-rose-300')}>
      {isCredit ? '+' : '-'}
      {formatCurrency(Math.abs(amount))}
    </span>
  )
}

// ─── Sticky table header ─────────────────────────────────────────────────────

function StickyTableHeader({
  sortField,
  sortDir,
  onSort,
  allSelected,
  onToggleAll,
}: {
  sortField: 'txn_date' | 'amount'
  sortDir: 'asc' | 'desc'
  onSort: (field: 'txn_date' | 'amount') => void
  allSelected: boolean
  onToggleAll: () => void
}) {
  return (
    <div
      className="sticky z-10 grid grid-cols-[20px_64px_88px_minmax(0,1fr)_minmax(0,2fr)_186px_minmax(0,1fr)_100px_96px] h-8 items-center gap-2 border-b border-border/60 bg-muted/60 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm"
      style={{ top: 'calc(var(--header-height, 64px) + 1px)' }}
    >
      <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all visible" />
      <button
        type="button"
        className="flex items-center gap-0.5 hover:text-foreground transition-colors"
        onClick={() => onSort('txn_date')}
      >
        Date
        {sortField === 'txn_date' && (sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
      <span>Account</span>
      <span>Merchant</span>
      <span>Description</span>
      <span>Category</span>
      <span>Tags</span>
      <button
        type="button"
        className="flex items-center justify-end gap-0.5 hover:text-foreground transition-colors"
        onClick={() => onSort('amount')}
      >
        Amount
        {sortField === 'amount' && (sortDir === 'asc' ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
      </button>
      <span />
    </div>
  )
}

// ─── Date group header ───────────────────────────────────────────────────────

function DateGroupHeader({
  date,
  count,
  collapsed,
  onToggle,
}: {
  date: string
  count: number
  collapsed: boolean
  onToggle: () => void
}) {
  const dateObj = new Date(date + 'T00:00:00')
  const label = dateObj.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-8 w-full items-center gap-2 border-b border-border/30 bg-muted/25 px-3 text-left transition-colors hover:bg-muted/40"
    >
      {collapsed
        ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      }
      <span className="text-xs font-medium">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{count} txn{count !== 1 ? 's' : ''}</span>
    </button>
  )
}

// ─── Compact transaction row ─────────────────────────────────────────────────

function CompactTxnRow({
  txn,
  account,
  category,
  selected,
  onToggleSelected,
  onEditCategory,
  onEditTags,
  expanded,
  onExpand,
  chainSize,
}: {
  txn: StatementTxn
  account?: AccountInfo
  category: CategoryWithHierarchy | undefined | null
  selected: boolean
  onToggleSelected: () => void
  onEditCategory: () => void
  onEditTags: () => void
  expanded: boolean
  onExpand: (id: string | null) => void
  chainSize?: number
}) {
  const merchantName = txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? 'Unknown'
  const showDescription = txn.description && txn.description !== merchantName

  return (
    <div className={cn(
      'border-b border-border/20 last:border-0',
      selected && 'border-l-2 border-l-amber-500',
    )}>
      <div
        className={cn(
          'grid grid-cols-[20px_64px_88px_minmax(0,1fr)_minmax(0,2fr)_186px_minmax(0,1fr)_100px_96px] min-h-[44px] items-center gap-2 px-3',
          'cursor-pointer transition-colors hover:bg-muted/30',
          selected ? 'bg-amber-500/5' : '',
        )}
        onClick={() => onExpand(expanded ? null : txn.id)}
      >
        {/* col1: checkbox */}
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${merchantName}`}
          />
        </div>

        {/* col2: date (MM/DD) */}
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {txn.txn_date.slice(5).replace('-', '/')}
        </span>

        {/* col3: account name */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate text-xs text-muted-foreground">
              {getAccountName(account) ?? '—'}
            </span>
          </TooltipTrigger>
          <TooltipContent>{getAccountName(account) ?? 'Unknown account'}</TooltipContent>
        </Tooltip>

        {/* col4: merchant */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate text-sm font-medium">{merchantName}</span>
          </TooltipTrigger>
          <TooltipContent>{merchantName}</TooltipContent>
        </Tooltip>

        {/* col5: description */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="truncate text-xs text-muted-foreground">
              {showDescription ? txn.description : ''}
            </span>
          </TooltipTrigger>
          {showDescription ? <TooltipContent>{txn.description}</TooltipContent> : null}
        </Tooltip>

        {/* col6: category */}
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
          {category?.color_hex
            ? <span className="size-2 shrink-0 rounded-full" style={{ background: category.color_hex }} />
            : <span className="size-2 shrink-0 rounded-full bg-muted-foreground/30" />
          }
          <span className="truncate text-xs text-muted-foreground">
            {category?.name ?? <span className="italic">Uncategorized</span>}
          </span>
        </div>

        {/* col7: tags (inline chips, up to 2 shown) */}
        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
          {txn.tags.slice(0, 2).map((tag) => (
            <TagBadge key={tag.id ?? tag.name} {...tag} className="text-[10px] h-5 py-0 shrink-0" />
          ))}
          {txn.tags.length > 2 && (
            <span className="shrink-0 text-[10px] text-muted-foreground">+{txn.tags.length - 2}</span>
          )}
        </div>

        {/* col8: amount */}
        <div className="min-w-0 overflow-hidden text-right">
          <AmountText amount={txn.amount} txnType={txn.txn_type} />
        </div>

        {/* col9: actions */}
        <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          {expanded
            ? <ChevronDown className="size-3 shrink-0 text-muted-foreground/50" />
            : <ChevronRight className="size-3 shrink-0 text-muted-foreground/30" />
          }
          {chainSize != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0 text-[10px] font-medium text-amber-400">⛓{chainSize}</span>
              </TooltipTrigger>
              <TooltipContent>{chainSize}-hop transfer chain</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={onEditCategory} aria-label="Edit category">
                <Shapes className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit category</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={onEditTags} aria-label="Edit tags">
                <Tags className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit tags</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Expanded detail row */}
      {expanded && (
        <div className="border-t border-border/10 bg-muted/15 px-5 py-2.5 space-y-2">
          {showDescription && (
            <p className="text-xs text-muted-foreground">{txn.description}</p>
          )}
          {txn.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tags</span>
              {txn.tags.map((tag) => (
                <TagBadge key={tag.id ?? tag.name} {...tag} className="text-[10px]" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pagination strip ────────────────────────────────────────────────────────

function PaginationStrip({
  currentPage,
  totalPages,
  onChange,
}: {
  currentPage: number
  totalPages: number
  onChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-3 border-t border-border/60 px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => onChange(currentPage - 1)}
      >
        <ChevronLeft className="size-4" />
        Prev
      </Button>
      <span className="min-w-[100px] text-center text-sm text-muted-foreground">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onChange(currentPage + 1)}
      >
        Next
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}

// ─── Floating action bar ─────────────────────────────────────────────────────

function FloatingActionBar({
  count,
  onClear,
  onAddTags,
  onRemoveTags,
  saving,
}: {
  count: number
  onClear: () => void
  onAddTags: () => void
  onRemoveTags: () => void
  saving: 'add' | 'remove' | null
}) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-card/95 px-4 py-2 shadow-lg backdrop-blur-sm">
        <span className="text-sm font-medium text-amber-400">{count} selected</span>
        <div className="h-4 w-px bg-border/60" />
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="mr-1 size-3.5" />
          Clear
        </Button>
        <Button size="sm" onClick={onAddTags} disabled={saving !== null}>
          {saving === 'add' ? 'Adding…' : 'Add Tags'}
        </Button>
        <Button variant="outline" size="sm" onClick={onRemoveTags} disabled={saving !== null}>
          {saving === 'remove' ? 'Removing…' : 'Remove Tags'}
        </Button>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function TransactionsTable() {
  const [transactions, setTransactions] = useState<StatementTxn[]>([])
  const [categories, setCategories] = useState<CategoryWithHierarchy[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [tags, setTags] = useState<TagPresentation[]>([])
  const [internalTransferLinks, setInternalTransferLinks] = useState<InternalTransferLinkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('all')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<StatementTxn | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingTagIds, setEditingTagIds] = useState<string[]>([])
  const [editingTransferTargetId, setEditingTransferTargetId] = useState<string | null>(null)
  const [selectedCounterpartAccountId, setSelectedCounterpartAccountId] = useState<string | null>(null)
  const [transferSearch, setTransferSearch] = useState('')
  const [editorFocusTarget, setEditorFocusTarget] = useState<EditorFocusTarget | null>(null)
  const [savingEditor, setSavingEditor] = useState(false)
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([])
  const [bulkSaving, setBulkSaving] = useState<'add' | 'remove' | null>(null)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [subgroupFilter, setSubgroupFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [accountFilterIds, setAccountFilterIds] = useState<string[]>([])
  const [dateRange, setDateRange] = useState('all_time')
  const [customDateStart, setCustomDateStart] = useState('')
  const [customDateEnd, setCustomDateEnd] = useState('')
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([])

  // Table-specific state
  const [currentPage, setCurrentPage] = useState(1)
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set())
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'txn_date' | 'amount'>('txn_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const deferredSearch = useDeferredValue(search)
  const deferredTransferSearch = useDeferredValue(transferSearch)

  const loadTags = useCallback(async () => {
    const response = await fetch('/api/tags?status=active&sortBy=name&sortDir=asc', { cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || 'Failed to load tags')
    setTags(Array.isArray(payload?.tags) ? payload.tags : [])
  }, [])

  async function createInlineTag(name: string) {
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || 'Failed to create tag')
    const tag = payload?.tag as TagPresentation | undefined
    if (tag) {
      setTags((current) => [...current, tag].sort((left, right) => left.name.localeCompare(right.name)))
      toast.success('Tag created')
      return tag
    }
    return null
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setLoading(false)
        return
      }

      const { data: accts } = await supabase
        .from('accounts')
        .select('id, product_name, nickname, account_type, institutions(name, website_url, icon_url)')
        .eq('household_id', profile.household_id)

      const accountList = (accts ?? []) as AccountInfo[]
      setAccounts(accountList)
      const accountIds = accountList.map((account) => account.id)

      if (accountIds.length === 0) {
        await loadTags()
        setInternalTransferLinks([])
        setTransactions([])
        setLoading(false)
        return
      }

      const [txnRes, catRes] = await Promise.all([
        supabase
          .from('statement_transactions')
          .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, description, category_id, account_id, confidence, category:categories(id, name, type, ledger_view, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)), statement_transaction_tags(tag:tags(id, name, color_token, color_hex, icon_key, source, is_active))')
          .in('account_id', accountIds)
          .order('txn_date', { ascending: false }),
        supabase
          .from('categories')
          .select('id, name, type, ledger_view, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)'),
      ])

      const baseTransactions = ((txnRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as unknown as Omit<StatementTxn, 'tags' | 'internalTransferLink'>),
        tags: flattenTags(row.statement_transaction_tags),
        internalTransferLink: null,
      }))

      const transferLinks = await loadTransferLinks(
        supabase,
        baseTransactions.map((txn) => txn.id),
      )

      await loadTags()

      setInternalTransferLinks(transferLinks)
      setTransactions(hydrateTransactions(baseTransactions, transferLinks, accountList))
      setCategories((catRes.data as unknown as CategoryWithHierarchy[]) ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [loadTags])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!editorOpen) {
      setEditorFocusTarget(null)
      setEditingTransferTargetId(null)
      setSelectedCounterpartAccountId(null)
      setTransferSearch('')
    }
  }, [editorOpen])

  const accountMap = useMemo(() => Object.fromEntries(accounts.map((account) => [account.id, account])), [accounts])
  const categoryMap = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])), [categories])
  const linkedCounterpartsByTransactionId = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const link of internalTransferLinks) {
      map.set(link.fromTransactionId, new Set([...(map.get(link.fromTransactionId) ?? []), link.toTransactionId]))
      map.set(link.toTransactionId, new Set([...(map.get(link.toTransactionId) ?? []), link.fromTransactionId]))
    }
    return map
  }, [internalTransferLinks])
  const chainGroups = useMemo(
    () => groupTransactionsByTransferChain(transactions, internalTransferLinks),
    [transactions, internalTransferLinks],
  )
  const chainByTransactionId = useMemo(() => {
    const map = new Map<string, TransferChainGroup<StatementTxn>>()
    for (const chain of chainGroups) {
      for (const member of chain.members) {
        map.set(member.txn.id, chain)
      }
    }
    return map
  }, [chainGroups])
  const groupOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const category of categories) {
      const group = category.category_group
      if (group) byId.set(group.id, group.name)
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [categories])
  const subgroupOptions = useMemo(() => {
    const byId = new Map<number, { name: string; group_id: number }>()
    for (const category of categories) {
      const subgroup = category.category_subgroup
      if (!subgroup) continue
      if (groupFilter !== 'all' && String(subgroup.group_id) !== groupFilter) continue
      byId.set(subgroup.id, { name: subgroup.name, group_id: subgroup.group_id })
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [categories, groupFilter])
  const categoryOptions = useMemo(() => {
    return categories
      .filter((category) => {
        if (groupFilter !== 'all' && String(category.group_id) !== groupFilter) return false
        if (subgroupFilter !== 'all' && String(category.subgroup_id) !== subgroupFilter) return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [categories, groupFilter, subgroupFilter])
  const compatibleEditorCategories = useMemo(() => {
    if (!editingTxn) return []
    return categories.filter((category) => (
      isPaymentCategoryTypeCompatible(category.type ?? category.payment_subtype, editingTxn.txn_type)
    ))
  }, [categories, editingTxn])
  const groupedEditorCategories = useMemo(() => getGroupedEditorCategories(compatibleEditorCategories), [compatibleEditorCategories])
  const currentEditorCategory = useMemo(() => {
    if (!editingTxn || editingCategoryId == null) return null
    return categoryMap[editingCategoryId] ?? editingTxn.category ?? null
  }, [categoryMap, editingCategoryId, editingTxn])
  const incompatibleCurrentCategory = useMemo(() => {
    if (!editingTxn) return null
    const currentCategory = editingTxn.category ?? (editingTxn.category_id != null ? categoryMap[editingTxn.category_id] : null)
    if (!currentCategory) return null
    return isPaymentCategoryTypeCompatible(currentCategory.type ?? currentCategory.payment_subtype, editingTxn.txn_type)
      ? null
      : currentCategory
  }, [categoryMap, editingTxn])
  const isEditingTransferCategory = useMemo(
    () => (currentEditorCategory?.type ?? currentEditorCategory?.payment_subtype) === 'transfer',
    [currentEditorCategory],
  )
  const editingTransferSummary = useMemo(() => {
    if (!editingTxn || !editingTransferTargetId) return null
    const counterpart = transactions.find((txn) => txn.id === editingTransferTargetId)
    if (!counterpart) return null

    return buildInternalTransferLinkSummary({
      sourceTransaction: toInternalTransferTransaction(editingTxn),
      counterpartTransaction: toInternalTransferTransaction(counterpart),
      counterpartAccountName: getAccountName(accountMap[counterpart.account_id]),
    })
  }, [accountMap, editingTransferTargetId, editingTxn, transactions])
  const editingResolvedTransferLinkType = useMemo(() => {
    if (!editingTxn || !editingTransferTargetId) {
      return resolveTransferCategoryLinkType(currentEditorCategory?.name) ?? 'internal_transfer'
    }

    const counterpart = transactions.find((txn) => txn.id === editingTransferTargetId)
    if (!counterpart) return resolveTransferCategoryLinkType(currentEditorCategory?.name) ?? 'internal_transfer'

    const categoryDerivedType = resolveTransferCategoryLinkType(currentEditorCategory?.name)
    if (categoryDerivedType && categoryDerivedType !== 'internal_transfer') return categoryDerivedType

    const classified = classifyLinkType(buildLinkCandidate(editingTxn, counterpart, accountMap)).type
    return classified ?? categoryDerivedType ?? 'internal_transfer'
  }, [accountMap, currentEditorCategory?.name, editingTransferTargetId, editingTxn, transactions])
  const counterpartAccountOptions = useMemo(() => {
    if (!editingTxn) return []

    return accounts
      .filter((account) => account.id !== editingTxn.account_id)
      .sort((left, right) => (getAccountName(left) ?? '').localeCompare(getAccountName(right) ?? ''))
  }, [accounts, editingTxn])
  const internalTransferCandidates = useMemo(() => {
    if (!editingTxn || !selectedCounterpartAccountId) {
      return { suggested: [], remaining: [] }
    }

    const normalizedSearch = deferredTransferSearch.trim().toLowerCase()
    const sourceDirection = normalizeTxnDirection(editingTxn.txn_type)

    const filteredCandidates = transactions
      .filter((candidate) => candidate.id !== editingTxn.id)
      .filter((candidate) => candidate.account_id === selectedCounterpartAccountId)
      .filter((candidate) => normalizeTxnDirection(candidate.txn_type) !== sourceDirection)
      .filter((candidate) => {
        const linkedCounterpartIds = linkedCounterpartsByTransactionId.get(candidate.id)
        if (!linkedCounterpartIds || linkedCounterpartIds.size === 0) return true
        return linkedCounterpartIds.size === 1 && linkedCounterpartIds.has(editingTxn.id)
      })
      .filter((candidate) => isTransferCandidateWithinPastDays(editingTxn.txn_date, candidate.txn_date, 2))
      .filter((candidate) => {
        if (!normalizedSearch) return true
        const searchableValues = [
          candidate.merchant_normalized,
          candidate.merchant_raw,
          candidate.description,
          getAccountName(accountMap[candidate.account_id]),
          formatDate(candidate.txn_date),
          formatCurrency(Math.abs(candidate.amount)),
        ]

        return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))
      })
    const sortCandidates = (left: StatementTxn, right: StatementTxn) => compareInternalTransferCandidates(
      toInternalTransferTransaction(editingTxn),
      toInternalTransferTransaction(left),
      toInternalTransferTransaction(right),
    )

    return {
      suggested: filteredCandidates
        .filter((candidate) => hasExactTransferCandidateAmount(editingTxn.amount, candidate.amount))
        .sort(sortCandidates),
      remaining: filteredCandidates
        .filter((candidate) => !hasExactTransferCandidateAmount(editingTxn.amount, candidate.amount))
        .sort(sortCandidates),
    }
  }, [
    accountMap,
    deferredTransferSearch,
    editingTxn,
    linkedCounterpartsByTransactionId,
    selectedCounterpartAccountId,
    transactions,
  ])

  useEffect(() => {
    if (!isEditingTransferCategory) {
      setEditingTransferTargetId(null)
      setSelectedCounterpartAccountId(null)
      setTransferSearch('')
    }
  }, [isEditingTransferCategory])

  useEffect(() => {
    if (!selectedCounterpartAccountId) return

    const isValidAccount = counterpartAccountOptions.some((account) => account.id === selectedCounterpartAccountId)
    if (!isValidAccount) setSelectedCounterpartAccountId(null)
  }, [counterpartAccountOptions, selectedCounterpartAccountId])

  useEffect(() => {
    if (!editingTransferTargetId || !selectedCounterpartAccountId) return

    const target = transactions.find((txn) => txn.id === editingTransferTargetId)
    if (target && target.account_id !== selectedCounterpartAccountId) {
      setEditingTransferTargetId(null)
    }
  }, [editingTransferTargetId, selectedCounterpartAccountId, transactions])

  const baseFilteredTransactions = useMemo(() => {
    const rangeStart = getDateRangeStart(dateRange, customDateStart)
    const rangeEnd = getDateRangeEnd(dateRange, customDateEnd)
    const normalizedSearch = deferredSearch.trim().toLowerCase()

    return [...transactions]
      .filter((txn) => {
        const merchant = txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? ''
        const searchable = [
          merchant,
          txn.description ?? '',
          formatCurrency(Math.abs(txn.amount)),
          getAccountName(accountMap[txn.account_id]) ?? '',
          txn.category?.name ?? '',
        ].join(' ').toLowerCase()

        if (normalizedSearch && !searchable.includes(normalizedSearch)) return false
        if (typeFilter !== 'all' && normalizeTxnDirection(txn.txn_type) !== typeFilter) return false
        const txnCategory = txn.category
        if (groupFilter !== 'all' && String(txnCategory?.group_id ?? '') !== groupFilter) return false
        if (subgroupFilter !== 'all' && String(txnCategory?.subgroup_id ?? '') !== subgroupFilter) return false
        if (categoryFilter !== 'all' && String(txnCategory?.id ?? '') !== categoryFilter) return false
        if (accountFilterIds.length > 0 && !accountFilterIds.includes(txn.account_id)) return false
        if (rangeStart && txn.txn_date < rangeStart) return false
        if (rangeEnd && txn.txn_date > rangeEnd) return false
        if (tagFilterIds.length > 0 && !tagFilterIds.every((tagId) => txn.tags.some((tag) => tag.id === tagId))) return false
        return true
      })
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
  }, [accountFilterIds, accountMap, categoryFilter, customDateEnd, customDateStart, dateRange, deferredSearch, groupFilter, subgroupFilter, tagFilterIds, transactions, typeFilter])

  const viewFilteredTransactions = useMemo(() => {
    if (viewMode === 'all') return baseFilteredTransactions
    return baseFilteredTransactions.filter((txn) => getTransactionLedgerView(txn.category) === viewMode)
  }, [baseFilteredTransactions, viewMode])

  // ─── Sort / paginate / group ─────────────────────────────────────────────

  const sortedTransactions = useMemo(() => {
    if (sortField === 'txn_date' && sortDir === 'desc') return viewFilteredTransactions
    return [...viewFilteredTransactions].sort((a, b) => {
      if (sortField === 'amount') {
        return sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount
      }
      return sortDir === 'asc' ? a.txn_date.localeCompare(b.txn_date) : b.txn_date.localeCompare(a.txn_date)
    })
  }, [viewFilteredTransactions, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(sortedTransactions.length / PAGE_SIZE))

  const paginatedTransactions = useMemo(
    () => sortedTransactions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sortedTransactions, currentPage],
  )

  const groupedByDate = useMemo(() => {
    const groups: Record<string, StatementTxn[]> = {}
    for (const txn of paginatedTransactions) {
      const d = txn.txn_date.slice(0, 10)
      ;(groups[d] ??= []).push(txn)
    }
    return groups
  }, [paginatedTransactions])

  const sortedDates = useMemo(
    () => Object.keys(groupedByDate).sort((a, b) =>
      (sortField === 'txn_date' && sortDir === 'asc') ? a.localeCompare(b) : b.localeCompare(a),
    ),
    [groupedByDate, sortField, sortDir],
  )

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [baseFilteredTransactions])

  const visibleTransactionIds = useMemo(
    () => paginatedTransactions.map((txn) => txn.id),
    [paginatedTransactions],
  )

  const selectedVisibleCount = useMemo(
    () => visibleTransactionIds.filter((id) => selectedIds.has(id)).length,
    [selectedIds, visibleTransactionIds],
  )

  const accountFilterLabel = useMemo(() => {
    if (accountFilterIds.length === 0) return 'All Accounts'
    if (accountFilterIds.length === 1) return getAccountName(accountMap[accountFilterIds[0]]) ?? '1 account'
    return `${accountFilterIds.length} accounts`
  }, [accountFilterIds, accountMap])

  const metrics = useMemo(() => {
    const spendingTotal = baseFilteredTransactions
      .filter((txn) => getTransactionLedgerView(txn.category) === 'spending')
      .reduce((sum, txn) => sum + Math.abs(Number(txn.amount)), 0)

    const cashFlowNet = baseFilteredTransactions
      .filter((txn) => getTransactionLedgerView(txn.category) === 'cash_flow')
      .reduce((sum, txn) => sum + (normalizeTxnDirection(txn.txn_type) === 'credit' ? Number(txn.amount) : -Math.abs(Number(txn.amount))), 0)

    const transferTotal = baseFilteredTransactions
      .filter((txn) => getTransactionLedgerView(txn.category) === 'excluded')
      .reduce((sum, txn) => sum + Math.abs(Number(txn.amount)), 0)

    const net = baseFilteredTransactions
      .filter((txn) => getTransactionLedgerView(txn.category) !== 'excluded')
      .reduce((sum, txn) => sum + (normalizeTxnDirection(txn.txn_type) === 'credit' ? Number(txn.amount) : -Math.abs(Number(txn.amount))), 0)

    return { spendingTotal, cashFlowNet, transferTotal, net }
  }, [baseFilteredTransactions])

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectMany(transactionIds: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allSelected = transactionIds.every((id) => next.has(id))
      for (const transactionId of transactionIds) {
        if (allSelected) next.delete(transactionId)
        else next.add(transactionId)
      }
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (visibleTransactionIds.length > 0 && visibleTransactionIds.every((id) => current.has(id))) {
        const next = new Set(current)
        for (const visibleId of visibleTransactionIds) next.delete(visibleId)
        return next
      }

      return new Set([...current, ...visibleTransactionIds])
    })
  }

  function openEditor(txn: StatementTxn, focusTarget: EditorFocusTarget) {
    setEditingTxn(txn)
    setEditingCategoryId(txn.category?.id ?? txn.category_id ?? null)
    setEditingTagIds(txn.tags.flatMap((tag) => (tag.id ? [tag.id] : [])))
    setEditingTransferTargetId(txn.internalTransferLink?.counterpartTransactionId ?? null)
    setSelectedCounterpartAccountId(txn.internalTransferLink?.counterpartAccountId ?? null)
    setTransferSearch('')
    setEditorFocusTarget(focusTarget)
    setEditorOpen(true)
  }

  async function saveTransactionEdits() {
    if (!editingTxn) return
    setSavingEditor(true)
    try {
      const response = await fetch(`/api/statement-transactions/${editingTxn.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: editingCategoryId,
          tagIds: editingTagIds,
          internalTransferTargetId: isEditingTransferCategory ? editingTransferTargetId : null,
          transferLinkType: isEditingTransferCategory && editingTransferTargetId ? editingResolvedTransferLinkType : null,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to update transaction')

      const nextTransaction = payload?.transaction as {
        id: string
        categoryId: number | null
        category: CategoryWithHierarchy | null
        tags: TagPresentation[]
        internalTransferLink: InternalTransferLinkSummary | null
      } | undefined

      if (!nextTransaction) {
        throw new Error('Transaction update response was incomplete')
      }

      const nextLinks = dedupeTransferLinks([
        ...internalTransferLinks.filter((link) => link.fromTransactionId !== editingTxn.id && link.toTransactionId !== editingTxn.id),
        ...(nextTransaction.internalTransferLink
          ? [{
              id: `client:${editingTxn.id}:${nextTransaction.internalTransferLink.counterpartTransactionId}`,
              fromTransactionId: editingTxn.id,
              toTransactionId: nextTransaction.internalTransferLink.counterpartTransactionId,
              linkType: editingResolvedTransferLinkType,
              status: 'confirmed',
              transferChainId: null,
              allocatedAmount: null,
            }]
          : []),
      ])

      setInternalTransferLinks(nextLinks)
      setTransactions((current) => hydrateTransactions(
        current.map((txn) => (
          txn.id === editingTxn.id
            ? {
                ...txn,
                category_id: nextTransaction.categoryId,
                category: nextTransaction.category,
                tags: Array.isArray(nextTransaction.tags) ? nextTransaction.tags : [],
              }
            : txn
        )),
        nextLinks,
        accounts,
      ))

      toast.success('Transaction updated')
      setEditorOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update transaction')
    } finally {
      setSavingEditor(false)
    }
  }

  async function runBulkTagMutation(mode: 'add' | 'remove') {
    const transactionIds = Array.from(selectedIds)
    if (transactionIds.length === 0) {
      toast.error('Select at least one transaction')
      return
    }
    if (bulkTagIds.length === 0) {
      toast.error('Choose at least one tag')
      return
    }

    setBulkSaving(mode)
    try {
      const response = await fetch('/api/statement-transactions/tags/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionIds,
          tagIds: bulkTagIds,
          mode,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Bulk tag update failed')

      const added = typeof payload?.result?.added === 'number' ? payload.result.added : 0
      const removed = typeof payload?.result?.removed === 'number' ? payload.result.removed : 0
      const skipped = typeof payload?.result?.skipped_existing === 'number' ? payload.result.skipped_existing : 0

      setTransactions((current) =>
        current.map((txn) => {
          if (!selectedIds.has(txn.id)) return txn
          const nextMap = new Map(txn.tags.flatMap((tag) => (tag.id ? [[tag.id, tag] as const] : [])))
          if (mode === 'add') {
            for (const tag of tags) {
              if (tag.id && bulkTagIds.includes(tag.id)) nextMap.set(tag.id, tag)
            }
          } else {
            for (const tagId of bulkTagIds) nextMap.delete(tagId)
          }
          return { ...txn, tags: Array.from(nextMap.values()) }
        }),
      )

      toast.success(
        mode === 'add'
          ? `Added ${added} mapping${added === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped} existing` : ''}.`
          : `Removed ${removed} mapping${removed === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk tag update failed')
    } finally {
      setBulkSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <ExecutivePage>
        <ExecutivePageHeader
          eyebrow="Money Workspace"
          title="Transactions"
          description="Compact table view — 50 rows per page, date-grouped, sortable columns. Click a row to expand tags."
          badges={(
            <>
              <Badge variant="outline">{sortedTransactions.length} rows</Badge>
              <Badge variant="outline">{selectedIds.size} selected</Badge>
            </>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Spending" value={formatCurrency(metrics.spendingTotal)} hint="Budget-facing outflows" />
          <MetricCard label="Cash Flow" value={formatCurrency(metrics.cashFlowNet)} hint="Income and liability movement" />
          <MetricCard label="Transfers" value={formatCurrency(metrics.transferTotal)} hint="Excluded reconciliation moves" />
          <MetricCard label="Net" value={formatCurrency(metrics.net)} hint={`${sortedTransactions.length} visible rows`} />
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border/70">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="size-4 text-primary" />
              View Modes
            </CardTitle>
            <CardDescription>
              Spending and cash flow flatten linked transactions. All keeps chains as flat rows with a chain indicator badge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 pt-6">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
              <TabsList className="w-full justify-start sm:w-fit">
                <TabsTrigger value="spending">Spending</TabsTrigger>
                <TabsTrigger value="cash_flow">Cash Flow</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="grid gap-3 xl:grid-cols-[1.3fr_repeat(5,minmax(0,1fr))]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search merchant, description, account, or amount…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full" aria-label="Transaction type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="credit">Credit</SelectItem>
                  <SelectItem value="debit">Debit</SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span>{accountFilterLabel}</span>
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <DropdownMenuLabel>Filter Accounts</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accounts.map((account) => (
                    <DropdownMenuCheckboxItem
                      key={account.id}
                      checked={accountFilterIds.includes(account.id)}
                      onCheckedChange={(checked) => {
                        setAccountFilterIds((current) => (
                          checked
                            ? [...current, account.id]
                            : current.filter((value) => value !== account.id)
                        ))
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <InstitutionIcon
                          iconUrl={getAccountInstitution(account)?.icon_url}
                          alt={`${getAccountInstitution(account)?.name ?? getAccountName(account) ?? 'Account'} icon`}
                          className="size-4 rounded-full bg-background"
                          fallbackClassName="size-3 text-muted-foreground"
                        />
                        <span>{getAccountName(account)}</span>
                      </div>
                    </DropdownMenuCheckboxItem>
                  ))}
                  {accountFilterIds.length > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setAccountFilterIds([])}>
                        Clear accounts
                      </Button>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <Select
                value={groupFilter}
                onValueChange={(value) => {
                  setGroupFilter(value)
                  setSubgroupFilter('all')
                  setCategoryFilter('all')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {groupOptions.map(([groupId, groupName]) => (
                    <SelectItem key={groupId} value={String(groupId)}>
                      {groupName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={subgroupFilter}
                onValueChange={(value) => {
                  setSubgroupFilter(value)
                  setCategoryFilter('all')
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Subgroup" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subgroups</SelectItem>
                  {subgroupOptions.map(([subgroupId, subgroup]) => (
                    <SelectItem key={subgroupId} value={String(subgroupId)}>
                      {subgroup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryOptions.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 xl:grid-cols-[220px,220px,1fr]">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full" aria-label="Date range">
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_time">All Time</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="90_days">Last 90 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>

              {dateRange === 'custom' ? (
                <>
                  <Input type="date" value={customDateStart} onChange={(event) => setCustomDateStart(event.target.value)} aria-label="Custom start date" />
                  <Input type="date" value={customDateEnd} onChange={(event) => setCustomDateEnd(event.target.value)} aria-label="Custom end date" />
                </>
              ) : (
                <div className="xl:col-span-2" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tag Filters & Bulk Edit</CardTitle>
            <CardDescription>
              Apply tag filters before switching views, then bulk-tag the visible rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TagSelector
              availableTags={tags}
              selectedTagIds={tagFilterIds}
              onChange={setTagFilterIds}
              onCreateTag={createInlineTag}
              title="Filter By Tags"
              triggerLabel="Choose filter tags"
              emptyLabel="No tag filter"
            />
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <TagSelector
                availableTags={tags}
                selectedTagIds={bulkTagIds}
                onChange={setBulkTagIds}
                onCreateTag={createInlineTag}
                title="Choose Tags For Bulk Update"
                triggerLabel="Choose bulk tags"
                emptyLabel="No bulk tags selected"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={toggleSelectAll}>
                  {visibleTransactionIds.length > 0 && selectedVisibleCount === visibleTransactionIds.length ? 'Clear visible selection' : 'Select visible'}
                </Button>
                <Button onClick={() => void runBulkTagMutation('add')} disabled={bulkSaving !== null}>
                  {bulkSaving === 'add' ? 'Adding…' : 'Add tags'}
                </Button>
                <Button variant="outline" onClick={() => void runBulkTagMutation('remove')} disabled={bulkSaving !== null}>
                  {bulkSaving === 'remove' ? 'Removing…' : 'Remove tags'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Compact table ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="border-b border-border/70 pb-0">
            <div className="flex items-center justify-between py-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {viewMode === 'all' ? <CheckCircle2 className="size-4 text-primary" /> : <ArrowLeftRight className="size-4 text-primary" />}
                {sortedTransactions.length} {getViewLedgerLabel(viewMode)} transactions
              </CardTitle>
              {totalPages > 1 && (
                <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sortedTransactions.length === 0 ? (
              <div className="px-6 py-8">
                <EmptyState
                  icon={ArrowLeftRight}
                  title="No transactions found"
                  description="Try adjusting your filters or import a new statement."
                  action={{ label: 'Import Statement', href: '/statements' }}
                />
              </div>
            ) : (
              <div className="relative overflow-x-auto">
                <StickyTableHeader
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={(field) => {
                    if (sortField === field) {
                      setSortDir((prev) => prev === 'asc' ? 'desc' : 'asc')
                    } else {
                      setSortField(field)
                      setSortDir('desc')
                    }
                  }}
                  allSelected={
                    paginatedTransactions.length > 0 &&
                    paginatedTransactions.every((t) => selectedIds.has(t.id))
                  }
                  onToggleAll={toggleSelectAll}
                />
                {sortedDates.map((date) => {
                  const dayTxns = groupedByDate[date]
                  const isCollapsed = collapsedDates.has(date)
                  return (
                    <div key={date}>
                      <DateGroupHeader
                        date={date}
                        count={dayTxns.length}
                        collapsed={isCollapsed}
                        onToggle={() => {
                          setCollapsedDates((prev) => {
                            const next = new Set(prev)
                            if (next.has(date)) next.delete(date)
                            else next.add(date)
                            return next
                          })
                        }}
                      />
                      {!isCollapsed && dayTxns.map((txn) => {
                        const category = txn.category ?? (txn.category_id != null ? categoryMap[txn.category_id] : undefined)
                        const chain = chainByTransactionId.get(txn.id)
                        const chainSize = chain ? chain.hopCount : undefined
                        return (
                          <CompactTxnRow
                            key={txn.id}
                            txn={txn}
                            account={accountMap[txn.account_id]}
                            category={category}
                            selected={selectedIds.has(txn.id)}
                            onToggleSelected={() => toggleSelected(txn.id)}
                            onEditCategory={() => openEditor(txn, 'category')}
                            onEditTags={() => openEditor(txn, 'tags')}
                            expanded={expandedRowId === txn.id}
                            onExpand={setExpandedRowId}
                            chainSize={chainSize}
                          />
                        )
                      })}
                    </div>
                  )
                })}
                <PaginationStrip
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onChange={(page) => {
                    setCurrentPage(page)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {viewMode === 'all' ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Legend</CardTitle>
              <CardDescription>Transfer chain members are shown as flat rows with a ⛓ hop count badge.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {(['origin', 'passthrough', 'terminal'] as const).map((role) => {
                const presentation = getRolePresentation(role)
                return (
                  <div key={role} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/30 px-3 py-2 text-sm text-muted-foreground">
                    <span className={cn('inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-semibold', presentation.className)}>
                      {presentation.glyph}
                    </span>
                    <span>{presentation.label}</span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ) : null}

        {/* ─── Editor Sheet ───────────────────────────────────────────────────── */}
        <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl"
            onOpenAutoFocus={(event) => {
              if (!editorFocusTarget) return

              event.preventDefault()
              const selector = editorFocusTarget === 'category'
                ? '[data-editor-focus-target="category"]'
                : '[data-editor-focus-target="tags"]'
              const container = event.currentTarget as HTMLElement | null
              const target = container?.querySelector<HTMLElement>(selector) ?? null
              target?.focus()
            }}
          >
            <SheetHeader>
              <SheetTitle>{editingTxn?.merchant_normalized ?? editingTxn?.merchant_raw ?? 'Transaction details'}</SheetTitle>
              <SheetDescription>Update the category, tags, and linked transfer counterpart for this transaction.</SheetDescription>
            </SheetHeader>
            {editingTxn ? (
              <div className="mt-6 space-y-6">
                <div className="rounded-[1.15rem] border border-border/70 bg-background/35 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{editingTxn.merchant_normalized ?? editingTxn.merchant_raw ?? 'Unknown merchant'}</p>
                      <p className="text-muted-foreground">{formatDate(editingTxn.txn_date)}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Badge variant="outline" className="gap-1">
                        <Tags className="size-3.5" />
                        {editingTagIds.length} selected
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Category</p>
                      <p className="text-xs text-muted-foreground">Assign a compatible category. Transfer categories unlock manual linking.</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditingCategoryId(null)} disabled={editingCategoryId == null}>
                      Clear
                    </Button>
                  </div>
                  <Select
                    value={editingCategoryId != null ? String(editingCategoryId) : '__empty__'}
                    onValueChange={(value) => setEditingCategoryId(value === '__empty__' ? null : Number(value))}
                  >
                    <SelectTrigger className="w-full" aria-label="Transaction category" data-editor-focus-target="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="__empty__">No category</SelectItem>
                      </SelectGroup>
                      {incompatibleCurrentCategory ? (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Current selection</SelectLabel>
                            <SelectItem value={String(incompatibleCurrentCategory.id)} disabled>
                              <span className="flex items-center gap-2">
                                <CategoryIcon {...incompatibleCurrentCategory} className="size-3.5 text-muted-foreground" />
                                <span>Current: {incompatibleCurrentCategory.name} (incompatible)</span>
                              </span>
                            </SelectItem>
                          </SelectGroup>
                        </>
                      ) : null}
                      {groupedEditorCategories.map((typeGroup, typeIndex) => (
                        <div key={typeGroup.type}>
                          {(typeIndex > 0 || incompatibleCurrentCategory) && <SelectSeparator />}
                          <SelectGroup>
                            <SelectLabel>{typeGroup.label}</SelectLabel>
                            {typeGroup.groups.map(([groupName, groupCategories]) => (
                              <div key={`${typeGroup.type}:${groupName}`}>
                                <SelectLabel className="pl-4 text-[11px]">{groupName}</SelectLabel>
                                {groupCategories.map((category) => (
                                  <SelectItem key={category.id} value={String(category.id)}>
                                    <span className="flex items-center gap-2">
                                      <CategoryIcon {...category} className="size-3.5 text-muted-foreground" />
                                      <span>{category.name}</span>
                                    </span>
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectGroup>
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isEditingTransferCategory ? (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Transfer counterpart</p>
                        <p className="text-xs text-muted-foreground">
                          Choose a counterpart account first. Then we will look for opposite-direction transactions from the same day or previous 2 days, with exact amount matches shown first.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditingTransferTargetId(null)} disabled={!editingTransferTargetId}>
                        Clear
                      </Button>
                    </div>

                    <div className="rounded-[1rem] border border-border/70 bg-background/30 p-3 text-sm">
                      {editingTransferSummary ? (
                        <div className="space-y-1">
                          <p className="font-medium">
                            {getTransferLinkLabel(editingResolvedTransferLinkType)} {editingTransferSummary.directionLabel} {editingTransferSummary.counterpartAccountName ?? 'linked account'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {editingTransferSummary.counterpartDisplayName ?? 'Unknown merchant'} • {formatDate(editingTransferSummary.counterpartTxnDate)} • {formatCurrency(Math.abs(editingTransferSummary.counterpartAmount))}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No counterpart selected.</p>
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
                      <Select
                        value={selectedCounterpartAccountId ?? '__empty__'}
                        onValueChange={(value) => {
                          const nextAccountId = value === '__empty__' ? null : value
                          setSelectedCounterpartAccountId(nextAccountId)
                          setTransferSearch('')
                        }}
                      >
                        <SelectTrigger className="w-full" aria-label="Counterpart account">
                          <SelectValue placeholder="Choose counterpart account" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="__empty__">Choose counterpart account</SelectItem>
                          </SelectGroup>
                          {counterpartAccountOptions.length > 0 ? <SelectSeparator /> : null}
                          <SelectGroup>
                            <SelectLabel>Available Accounts</SelectLabel>
                            {counterpartAccountOptions.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                <span className="flex items-center gap-2">
                                  <InstitutionIcon
                                    iconUrl={getAccountInstitution(account)?.icon_url}
                                    alt={`${getAccountInstitution(account)?.name ?? getAccountName(account) ?? 'Account'} icon`}
                                    className="size-4 rounded-full bg-background"
                                    fallbackClassName="size-3 text-muted-foreground"
                                  />
                                  <span>{getAccountName(account) ?? 'Unknown account'}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>

                      <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={transferSearch}
                          onChange={(event) => setTransferSearch(event.target.value)}
                          placeholder="Search transfer counterpart"
                          className="pl-9"
                          disabled={!selectedCounterpartAccountId}
                        />
                      </div>
                    </div>

                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {!selectedCounterpartAccountId ? (
                        <div className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-sm text-muted-foreground">
                          Select a counterpart account to review matching transactions.
                        </div>
                      ) : null}
                      {selectedCounterpartAccountId
                        && internalTransferCandidates.suggested.length === 0
                        && internalTransferCandidates.remaining.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border/70 px-3 py-5 text-sm text-muted-foreground">
                            No opposite-direction transactions were found in the selected account within the previous 2 days.
                          </div>
                        ) : null}

                      {[
                        {
                          key: 'suggested',
                          label: 'Suggested matches',
                          description: 'Exact amount + opposite direction',
                          candidates: internalTransferCandidates.suggested,
                        },
                        {
                          key: 'remaining',
                          label: 'Other eligible transactions',
                          description: 'Other opposite-direction transactions in 2 days',
                          candidates: internalTransferCandidates.remaining,
                        },
                      ].map((group) => {
                        if (!selectedCounterpartAccountId || group.candidates.length === 0) return null

                        return (
                          <div key={group.key} className="space-y-2">
                            <div className="flex items-center justify-between gap-2 px-1">
                              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{group.label}</p>
                              <span className="text-[11px] text-muted-foreground">{group.description}</span>
                            </div>

                            {group.candidates.map((candidate) => {
                              const candidateAccountName = getAccountName(accountMap[candidate.account_id])
                              const candidateMerchantName = candidate.merchant_normalized ?? candidate.merchant_raw ?? candidate.description ?? 'Unknown'
                              const isSelected = candidate.id === editingTransferTargetId
                              const predictedType = classifyLinkType(buildLinkCandidate(editingTxn, candidate, accountMap)).type

                              return (
                                <button
                                  key={candidate.id}
                                  type="button"
                                  className={cn(
                                    'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left',
                                    isSelected && 'border-primary bg-primary/5',
                                  )}
                                  onClick={() => setEditingTransferTargetId(candidate.id)}
                                >
                                  <div className="space-y-1">
                                    <p className="font-medium">{candidateMerchantName}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {candidateAccountName ?? 'Unknown account'} • {formatDate(candidate.txn_date)} • {formatCurrency(Math.abs(candidate.amount))}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <Badge variant={isSelected ? 'default' : 'outline'}>
                                      {normalizeTxnDirection(candidate.txn_type) === 'credit' ? 'Credit' : 'Debit'}
                                    </Badge>
                                    {predictedType ? (
                                      <span className="text-[11px] text-muted-foreground">{getTransferLinkLabel(predictedType)}</span>
                                    ) : null}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Tags</p>
                    <p className="text-xs text-muted-foreground">Tag this transaction for downstream filtering and batch actions.</p>
                  </div>
                  <TagSelector
                    availableTags={tags}
                    selectedTagIds={editingTagIds}
                    onChange={setEditingTagIds}
                    onCreateTag={createInlineTag}
                    title="Choose tags"
                    triggerLabel="Choose tags"
                    emptyLabel="No tags selected"
                    triggerFocusTarget="tags"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void saveTransactionEdits()} disabled={savingEditor}>
                    {savingEditor ? 'Saving…' : 'Save changes'}
                  </Button>
                </div>
              </div>
            ) : null}
          </SheetContent>
        </Sheet>

        {/* ─── Floating selection bar ─────────────────────────────────────────── */}
        <FloatingActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onAddTags={() => void runBulkTagMutation('add')}
          onRemoveTags={() => void runBulkTagMutation('remove')}
          saving={bulkSaving}
        />
      </ExecutivePage>
    </TooltipProvider>
  )
}
