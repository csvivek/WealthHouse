'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  Clock,
  Filter,
  MoreHorizontal,
  Search,
  Shapes,
  Tags,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CategoryBadge } from '@/components/category-badge'
import { CategoryIcon } from '@/components/category-icon'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { TagSelector } from '@/components/tag-selector'
import {
  isPaymentCategoryTypeCompatible,
  normalizeTxnDirection,
} from '@/lib/transactions/category-compatibility'
import {
  buildInternalTransferLinkSummary,
  compareInternalTransferCandidates,
  isInternalTransferCategoryName,
  type InternalTransferLinkRecord,
  type InternalTransferLinkSummary,
  type InternalTransferTransactionLike,
} from '@/lib/transactions/internal-transfer-links'
import { toast } from 'sonner'

function getDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function getDateRangeStart(range: string) {
  const now = new Date()
  switch (range) {
    case 'all_time':
      return null
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0]
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .split('T')[0]
    case '90_days':
      return getDaysAgo(90)
    default:
      return null
  }
}

function getDateRangeEnd(range: string) {
  if (range === 'all_time') return null
  if (range === 'last_month') {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 0)
      .toISOString()
      .split('T')[0]
  }
  return new Date().toISOString().split('T')[0]
}

interface CategoryWithHierarchy {
  id: number
  name: string
  type: 'income' | 'expense' | 'transfer' | null
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

type EditorFocusTarget = 'category' | 'tags'

const UNCATEGORIZED_VALUE = 'uncategorized'

function flattenTags(value: unknown): TagPresentation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const rawTag = (entry as { tag?: unknown }).tag
    const tags = Array.isArray(rawTag) ? rawTag : rawTag ? [rawTag] : []
    return tags.filter(
      (tag): tag is TagPresentation =>
        Boolean(tag) &&
        typeof tag === 'object' &&
        typeof (tag as TagPresentation).name === 'string'
    )
  })
}

function normalizeTransferLinks(value: unknown): InternalTransferLinkRecord[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    if (
      typeof row.from_transaction_id !== 'string' ||
      typeof row.to_transaction_id !== 'string'
    )
      return []

    return [
      {
        id: typeof row.id === 'string' ? row.id : null,
        fromTransactionId: row.from_transaction_id,
        toTransactionId: row.to_transaction_id,
        linkType: typeof row.link_type === 'string' ? row.link_type : null,
        status: typeof row.status === 'string' ? row.status : null,
      },
    ]
  })
}

function dedupeTransferLinks(links: InternalTransferLinkRecord[]) {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key =
      link.id ??
      `${link.fromTransactionId}:${link.toTransactionId}:${link.linkType ?? 'internal_transfer'}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getGroupedEditorCategories(categories: CategoryWithHierarchy[]) {
  const typeOrder: Array<NonNullable<CategoryWithHierarchy['type']>> = [
    'income',
    'expense',
    'transfer',
  ]
  const typeLabels: Record<NonNullable<CategoryWithHierarchy['type']>, string> =
    {
      income: 'Income Categories',
      expense: 'Expense Categories',
      transfer: 'Transfer Categories',
    }

  return typeOrder
    .map((type) => {
      const categoriesForType = categories
        .filter(
          (category) =>
            (category.type ?? category.payment_subtype ?? 'expense') === type
        )
        .sort((left, right) => {
          const groupCompare = (
            left.category_group?.name ?? 'Ungrouped'
          ).localeCompare(right.category_group?.name ?? 'Ungrouped')
          return groupCompare !== 0
            ? groupCompare
            : left.name.localeCompare(right.name)
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
    })
    .filter((group) => group.groups.length > 0)
}

function toInternalTransferTransaction(
  txn: StatementTxn
): InternalTransferTransactionLike {
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

function hydrateTransactions(
  baseTransactions: StatementTxn[],
  transferLinks: InternalTransferLinkRecord[],
  accounts: AccountInfo[]
) {
  const transactionMap = Object.fromEntries(
    baseTransactions.map((txn) => [txn.id, toInternalTransferTransaction(txn)])
  )
  const accountMap = Object.fromEntries(
    accounts.map((account) => [
      account.id,
      { id: account.id, name: getAccountName(account) },
    ])
  )

  return baseTransactions.map((txn) => ({
    ...txn,
    internalTransferLink: buildResolvedInternalTransferLink(
      txn.id,
      transactionMap,
      accountMap,
      transferLinks
    ),
  }))
}

function buildResolvedInternalTransferLink(
  transactionId: string,
  transactionsById: Record<string, InternalTransferTransactionLike>,
  accountsById: Record<string, { id: string; name: string | null }>,
  transferLinks: InternalTransferLinkRecord[]
) {
  return transferLinks.length === 0
    ? null
    : buildInternalTransferLinkSummaryFromResolved(
        transactionId,
        transactionsById,
        accountsById,
        transferLinks
      )
}

function buildInternalTransferLinkSummaryFromResolved(
  transactionId: string,
  transactionsById: Record<string, InternalTransferTransactionLike>,
  accountsById: Record<string, { id: string; name: string | null }>,
  transferLinks: InternalTransferLinkRecord[]
) {
  const sourceTransaction = transactionsById[transactionId]
  if (!sourceTransaction) return null

  const link = transferLinks.find(
    (candidate) =>
      candidate.fromTransactionId === transactionId ||
      candidate.toTransactionId === transactionId
  )
  if (!link) return null

  const counterpartId =
    link.fromTransactionId === transactionId
      ? link.toTransactionId
      : link.fromTransactionId
  const counterpartTransaction = transactionsById[counterpartId]
  if (!counterpartTransaction) return null

  return buildInternalTransferLinkSummary({
    sourceTransaction,
    counterpartTransaction,
    counterpartAccountName:
      accountsById[counterpartTransaction.accountId]?.name ?? null,
  })
}

async function loadInternalTransferLinks(
  supabase: ReturnType<typeof createClient>,
  transactionIds: string[]
) {
  if (transactionIds.length === 0) return []

  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status')
      .eq('link_type', 'internal_transfer')
      .eq('status', 'confirmed')
      .in('from_transaction_id', transactionIds),
    supabase
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status')
      .eq('link_type', 'internal_transfer')
      .eq('status', 'confirmed')
      .in('to_transaction_id', transactionIds),
  ])

  if (outgoingResult.error) throw new Error(outgoingResult.error.message)
  if (incomingResult.error) throw new Error(incomingResult.error.message)

  return dedupeTransferLinks([
    ...normalizeTransferLinks(outgoingResult.data),
    ...normalizeTransferLinks(incomingResult.data),
  ])
}

// Stats Card Component
function StatsCard({
  label,
  value,
  subvalue,
  icon: Icon,
  trend,
  className,
}: {
  label: string
  value: string | number
  subvalue?: string
  icon?: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-4 transition-all hover:shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <div className="rounded-lg bg-muted p-1.5">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {trend && trend !== 'neutral' && (
          <TrendingUp
            className={cn(
              'size-4',
              trend === 'up' ? 'text-income' : 'rotate-180 text-expense'
            )}
          />
        )}
      </div>
      {subvalue && (
        <span className="text-xs text-muted-foreground">{subvalue}</span>
      )}
    </div>
  )
}

// Transaction Row Component
function TransactionRow({
  txn,
  category,
  account,
  isSelected,
  onToggleSelect,
  onEditCategory,
  onEditTags,
}: {
  txn: StatementTxn
  category: CategoryWithHierarchy | undefined
  account: AccountInfo | undefined
  isSelected: boolean
  onToggleSelect: () => void
  onEditCategory: () => void
  onEditTags: () => void
}) {
  const isCredit = normalizeTxnDirection(txn.txn_type) === 'credit'
  const merchantName =
    txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? 'Unknown'

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm',
        isSelected && 'border-primary/30 bg-primary/5'
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggleSelect}
        aria-label={`Select ${merchantName}`}
        className="shrink-0"
      />

      {/* Amount indicator */}
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          isCredit ? 'bg-income/10' : 'bg-expense/10'
        )}
      >
        {isCredit ? (
          <ArrowDownRight className="size-5 text-income" />
        ) : (
          <ArrowUpRight className="size-5 text-expense" />
        )}
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{merchantName}</span>
          {txn.confidence > 0 && txn.confidence < 0.9 && (
            <Badge variant="outline" className="text-[10px]">
              Low conf
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{getAccountName(account) ?? 'Unknown'}</span>
          {txn.internalTransferLink && (
            <>
              <span>-</span>
              <span>
                Transfer {txn.internalTransferLink.directionLabel}{' '}
                {txn.internalTransferLink.counterpartAccountName ?? 'linked'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Category */}
      <div className="hidden shrink-0 sm:block">
        {category ? (
          <CategoryBadge {...category} />
        ) : (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Uncategorized
          </Badge>
        )}
      </div>

      {/* Tags */}
      <div className="hidden max-w-[150px] shrink-0 md:block">
        <div className="flex flex-wrap gap-1">
          {txn.tags.length > 0 ? (
            txn.tags.slice(0, 2).map((tag) => (
              <TagBadge
                key={tag.id ?? tag.name}
                {...tag}
                className="text-[10px]"
              />
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No tags</span>
          )}
          {txn.tags.length > 2 && (
            <Badge variant="outline" className="text-[10px]">
              +{txn.tags.length - 2}
            </Badge>
          )}
        </div>
      </div>

      {/* Amount */}
      <div className="shrink-0 text-right">
        <span
          className={cn(
            'font-semibold tabular-nums',
            isCredit ? 'text-income' : 'text-expense'
          )}
        >
          {isCredit ? '+' : '-'}
          {formatCurrency(Math.abs(txn.amount))}
        </span>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onEditCategory}
        >
          <Shapes className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={onEditTags}
        >
          <Tags className="size-4" />
        </Button>
      </div>
    </div>
  )
}

// Date Group Component
function DateGroup({
  date,
  transactions,
  categoryMap,
  accountMap,
  selectedIds,
  onToggleSelect,
  onEditCategory,
  onEditTags,
}: {
  date: string
  transactions: StatementTxn[]
  categoryMap: Record<number, CategoryWithHierarchy>
  accountMap: Record<string, AccountInfo>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onEditCategory: (txn: StatementTxn) => void
  onEditTags: (txn: StatementTxn) => void
}) {
  const [isOpen, setIsOpen] = useState(true)
  const dayTotal = transactions.reduce((sum, txn) => {
    const direction = normalizeTxnDirection(txn.txn_type)
    return sum + (direction === 'credit' ? txn.amount : -txn.amount)
  }, 0)

  const formattedDate = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-muted/50">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-muted-foreground" />
          <span className="font-medium">{formattedDate}</span>
          <Badge variant="secondary" className="text-xs">
            {transactions.length}
          </Badge>
        </div>
        <span
          className={cn(
            'font-medium tabular-nums',
            dayTotal >= 0 ? 'text-income' : 'text-expense'
          )}
        >
          {dayTotal >= 0 ? '+' : ''}
          {formatCurrency(dayTotal)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 pl-6">
          {transactions.map((txn) => {
            const category =
              txn.category ??
              (txn.category_id != null ? categoryMap[txn.category_id] : undefined)
            return (
              <TransactionRow
                key={txn.id}
                txn={txn}
                category={category}
                account={accountMap[txn.account_id]}
                isSelected={selectedIds.has(txn.id)}
                onToggleSelect={() => onToggleSelect(txn.id)}
                onEditCategory={() => onEditCategory(txn)}
                onEditTags={() => onEditTags(txn)}
              />
            )
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<StatementTxn[]>([])
  const [categories, setCategories] = useState<CategoryWithHierarchy[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [tags, setTags] = useState<TagPresentation[]>([])
  const [internalTransferLinks, setInternalTransferLinks] = useState<
    InternalTransferLinkRecord[]
  >([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<StatementTxn | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingTagIds, setEditingTagIds] = useState<string[]>([])
  const [editingTransferTargetId, setEditingTransferTargetId] = useState<
    string | null
  >(null)
  const [transferSearch, setTransferSearch] = useState('')
  const [editorFocusTarget, setEditorFocusTarget] =
    useState<EditorFocusTarget | null>(null)
  const [savingEditor, setSavingEditor] = useState(false)
  const [bulkTagIds, setBulkTagIds] = useState<string[]>([])
  const [bulkSaving, setBulkSaving] = useState<'add' | 'remove' | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [showBulkActions, setShowBulkActions] = useState(false)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [dateRange, setDateRange] = useState('this_month')
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([])

  const loadTags = useCallback(async () => {
    const response = await fetch(
      '/api/tags?status=active&sortBy=name&sortDir=asc',
      { cache: 'no-store' }
    )
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
      setTags((current) =>
        [...current, tag].sort((left, right) =>
          left.name.localeCompare(right.name)
        )
      )
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
        .select('id, product_name, nickname')
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
          .select(
            'id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, description, category_id, account_id, confidence, category:categories(id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)), statement_transaction_tags(tag:tags(id, name, color_token, color_hex, icon_key, source, is_active))'
          )
          .in('account_id', accountIds)
          .order('txn_date', { ascending: false }),
        supabase
          .from('categories')
          .select(
            'id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)'
          ),
      ])

      const baseTransactions = (
        (txnRes.data ?? []) as Array<Record<string, unknown>>
      ).map((row) => ({
        ...(row as unknown as Omit<
          StatementTxn,
          'tags' | 'internalTransferLink'
        >),
        tags: flattenTags(row.statement_transaction_tags),
        internalTransferLink: null,
      }))

      const transferLinks = await loadInternalTransferLinks(
        supabase,
        baseTransactions.map((txn) => txn.id)
      )

      await loadTags()

      setInternalTransferLinks(transferLinks)
      setTransactions(
        hydrateTransactions(baseTransactions, transferLinks, accountList)
      )
      setCategories((catRes.data as unknown as CategoryWithHierarchy[]) ?? [])
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load transactions'
      )
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
      setTransferSearch('')
    }
  }, [editorOpen])

  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account])),
    [accounts]
  )
  const categoryMap = useMemo(
    () =>
      Object.fromEntries(categories.map((category) => [category.id, category])),
    [categories]
  )
  const linkedCounterpartByTransactionId = useMemo(() => {
    const pairs = new Map<string, string>()
    for (const link of internalTransferLinks) {
      pairs.set(link.fromTransactionId, link.toTransactionId)
      pairs.set(link.toTransactionId, link.fromTransactionId)
    }
    return pairs
  }, [internalTransferLinks])

  const categoryOptions = useMemo(() => {
    return categories.sort((a, b) => a.name.localeCompare(b.name))
  }, [categories])

  const compatibleEditorCategories = useMemo(() => {
    if (!editingTxn) return []
    return categories.filter((category) =>
      isPaymentCategoryTypeCompatible(
        category.type ?? category.payment_subtype,
        editingTxn.txn_type
      )
    )
  }, [categories, editingTxn])

  const groupedEditorCategories = useMemo(
    () => getGroupedEditorCategories(compatibleEditorCategories),
    [compatibleEditorCategories]
  )

  const currentEditorCategory = useMemo(() => {
    if (!editingTxn || editingCategoryId == null) return null
    return categoryMap[editingCategoryId] ?? editingTxn.category ?? null
  }, [categoryMap, editingCategoryId, editingTxn])

  const incompatibleCurrentCategory = useMemo(() => {
    if (!editingTxn) return null
    const currentCategory =
      editingTxn.category ??
      (editingTxn.category_id != null
        ? categoryMap[editingTxn.category_id]
        : null)
    if (!currentCategory) return null
    return isPaymentCategoryTypeCompatible(
      currentCategory.type ?? currentCategory.payment_subtype,
      editingTxn.txn_type
    )
      ? null
      : currentCategory
  }, [categoryMap, editingTxn])

  const isEditingInternalTransferCategory = useMemo(
    () => isInternalTransferCategoryName(currentEditorCategory?.name),
    [currentEditorCategory]
  )

  const editingTransferSummary = useMemo(() => {
    if (!editingTxn || !editingTransferTargetId) return null
    const counterpart = transactions.find(
      (txn) => txn.id === editingTransferTargetId
    )
    if (!counterpart) return null
    return buildInternalTransferLinkSummary({
      sourceTransaction: toInternalTransferTransaction(editingTxn),
      counterpartTransaction: toInternalTransferTransaction(counterpart),
      counterpartAccountName: getAccountName(accountMap[counterpart.account_id]),
    })
  }, [accountMap, editingTransferTargetId, editingTxn, transactions])

  const internalTransferCandidates = useMemo(() => {
    if (!editingTxn) return []
    const normalizedSearch = transferSearch.trim().toLowerCase()
    return [...transactions]
      .filter((candidate) => candidate.id !== editingTxn.id)
      .filter((candidate) => candidate.account_id !== editingTxn.account_id)
      .filter((candidate) => {
        const linkedCounterpartId = linkedCounterpartByTransactionId.get(
          candidate.id
        )
        return !linkedCounterpartId || linkedCounterpartId === editingTxn.id
      })
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
        return searchableValues.some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(normalizedSearch)
        )
      })
      .sort((left, right) =>
        compareInternalTransferCandidates(
          toInternalTransferTransaction(editingTxn),
          toInternalTransferTransaction(left),
          toInternalTransferTransaction(right)
        )
      )
  }, [
    accountMap,
    editingTxn,
    linkedCounterpartByTransactionId,
    transactions,
    transferSearch,
  ])

  useEffect(() => {
    if (!isEditingInternalTransferCategory) {
      setEditingTransferTargetId(null)
      setTransferSearch('')
    }
  }, [isEditingInternalTransferCategory])

  const filtered = useMemo(() => {
    const rangeStart = getDateRangeStart(dateRange)
    const rangeEnd = getDateRangeEnd(dateRange)

    return [...transactions]
      .filter((txn) => {
        const merchant =
          txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? ''
        if (search && !merchant.toLowerCase().includes(search.toLowerCase()))
          return false
        if (
          typeFilter !== 'all' &&
          normalizeTxnDirection(txn.txn_type) !== typeFilter
        )
          return false
        const txnCategory = txn.category
        if (
          categoryFilter !== 'all' &&
          String(txnCategory?.id ?? '') !== categoryFilter
        )
          return false
        if (accountFilter !== 'all' && txn.account_id !== accountFilter)
          return false
        if (rangeStart && txn.txn_date < rangeStart) return false
        if (rangeEnd && txn.txn_date > rangeEnd) return false
        if (
          tagFilterIds.length > 0 &&
          !tagFilterIds.every((tagId) =>
            txn.tags.some((tag) => tag.id === tagId)
          )
        )
          return false
        return true
      })
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
  }, [
    transactions,
    search,
    typeFilter,
    categoryFilter,
    accountFilter,
    dateRange,
    tagFilterIds,
  ])

  // Group transactions by date
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, StatementTxn[]>()
    for (const txn of filtered) {
      const date = txn.txn_date
      groups.set(date, [...(groups.get(date) ?? []), txn])
    }
    return Array.from(groups.entries()).sort((a, b) =>
      b[0].localeCompare(a[0])
    )
  }, [filtered])

  // Calculate stats
  const stats = useMemo(() => {
    const totalIncome = filtered
      .filter((txn) => normalizeTxnDirection(txn.txn_type) === 'credit')
      .reduce((sum, txn) => sum + txn.amount, 0)
    const totalExpense = filtered
      .filter((txn) => normalizeTxnDirection(txn.txn_type) === 'debit')
      .reduce((sum, txn) => sum + Math.abs(txn.amount), 0)
    const netFlow = totalIncome - totalExpense
    return { totalIncome, totalExpense, netFlow, count: filtered.length }
  }, [filtered])

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      if (
        filtered.length > 0 &&
        filtered.every((txn) => current.has(txn.id))
      )
        return new Set()
      return new Set(filtered.map((txn) => txn.id))
    })
  }

  function openEditor(txn: StatementTxn, focusTarget: EditorFocusTarget) {
    setEditingTxn(txn)
    setEditingCategoryId(txn.category?.id ?? txn.category_id ?? null)
    setEditingTagIds(txn.tags.flatMap((tag) => (tag.id ? [tag.id] : [])))
    setEditingTransferTargetId(
      txn.internalTransferLink?.counterpartTransactionId ?? null
    )
    setTransferSearch('')
    setEditorFocusTarget(focusTarget)
    setEditorOpen(true)
  }

  async function saveTransactionEdits() {
    if (!editingTxn) return
    setSavingEditor(true)
    try {
      const response = await fetch(
        `/api/statement-transactions/${editingTxn.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: editingCategoryId,
            tagIds: editingTagIds,
            internalTransferTargetId: isEditingInternalTransferCategory
              ? editingTransferTargetId
              : null,
          }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to update transaction')

      const nextTransaction = payload?.transaction as
        | {
            id: string
            categoryId: number | null
            category: CategoryWithHierarchy | null
            tags: TagPresentation[]
            internalTransferLink: InternalTransferLinkSummary | null
          }
        | undefined

      if (!nextTransaction) {
        throw new Error('Transaction update response was incomplete')
      }

      const nextLinks = dedupeTransferLinks([
        ...internalTransferLinks.filter(
          (link) =>
            link.fromTransactionId !== editingTxn.id &&
            link.toTransactionId !== editingTxn.id
        ),
        ...(nextTransaction.internalTransferLink
          ? [
              {
                id: `client:${editingTxn.id}:${nextTransaction.internalTransferLink.counterpartTransactionId}`,
                fromTransactionId: editingTxn.id,
                toTransactionId:
                  nextTransaction.internalTransferLink.counterpartTransactionId,
                linkType: 'internal_transfer',
                status: 'confirmed',
              },
            ]
          : []),
      ])

      setInternalTransferLinks(nextLinks)
      setTransactions((current) =>
        hydrateTransactions(
          current.map((txn) =>
            txn.id === editingTxn.id
              ? {
                  ...txn,
                  category_id: nextTransaction.categoryId,
                  category: nextTransaction.category,
                  tags: Array.isArray(nextTransaction.tags)
                    ? nextTransaction.tags
                    : [],
                }
              : txn
          ),
          nextLinks,
          accounts
        )
      )
      toast.success('Transaction updated')
      setEditorOpen(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update transaction'
      )
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
      if (!response.ok)
        throw new Error(payload?.error || 'Bulk tag update failed')

      const added =
        typeof payload?.result?.added === 'number' ? payload.result.added : 0
      const removed =
        typeof payload?.result?.removed === 'number' ? payload.result.removed : 0
      const skipped =
        typeof payload?.result?.skipped_existing === 'number'
          ? payload.result.skipped_existing
          : 0

      setTransactions((current) =>
        current.map((txn) => {
          if (!selectedIds.has(txn.id)) return txn
          const nextMap = new Map(
            txn.tags.flatMap((tag) =>
              tag.id ? ([[tag.id, tag] as const]) : []
            )
          )
          if (mode === 'add') {
            for (const tag of tags) {
              if (tag.id && bulkTagIds.includes(tag.id)) nextMap.set(tag.id, tag)
            }
          } else {
            for (const tagId of bulkTagIds) nextMap.delete(tagId)
          }
          return { ...txn, tags: Array.from(nextMap.values()) }
        })
      )

      toast.success(
        mode === 'add'
          ? `Added ${added} mapping${added === 1 ? '' : 's'}${skipped > 0 ? `, skipped ${skipped} existing` : ''}.`
          : `Removed ${removed} mapping${removed === 1 ? '' : 's'}.`
      )
      setShowBulkActions(false)
      setSelectedIds(new Set())
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Bulk tag update failed'
      )
    } finally {
      setBulkSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            Loading transactions...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            Review and manage your imported transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filtered.length} shown</Badge>
          {selectedIds.size > 0 && (
            <Badge variant="secondary">{selectedIds.size} selected</Badge>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Income"
          value={formatCurrency(stats.totalIncome)}
          icon={TrendingUp}
          className="border-income/20"
        />
        <StatsCard
          label="Expenses"
          value={formatCurrency(stats.totalExpense)}
          icon={TrendingDown}
          className="border-expense/20"
        />
        <StatsCard
          label="Net Flow"
          value={formatCurrency(stats.netFlow)}
          trend={stats.netFlow >= 0 ? 'up' : 'down'}
        />
        <StatsCard
          label="Transactions"
          value={stats.count}
          subvalue={`${accounts.length} accounts`}
          icon={Clock}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search merchants..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
            {search && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
                onClick={() => setSearch('')}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>

          {/* Type Tabs */}
          <Tabs value={typeFilter} onValueChange={setTypeFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="credit">Income</TabsTrigger>
              <TabsTrigger value="debit">Expense</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="ml-auto flex items-center gap-2">
            {/* Date Range */}
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="this_month">This Month</SelectItem>
                <SelectItem value="last_month">Last Month</SelectItem>
                <SelectItem value="90_days">Last 90 Days</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter Toggle */}
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="size-4" />
            </Button>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px] bg-background">
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

            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {getAccountName(account)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TagSelector
              availableTags={tags}
              selectedTagIds={tagFilterIds}
              onChange={setTagFilterIds}
              onCreateTag={createInlineTag}
              title="Filter By Tags"
              triggerLabel="Filter tags"
              emptyLabel="No tag filter"
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setTypeFilter('all')
                setCategoryFilter('all')
                setAccountFilter('all')
                setDateRange('this_month')
                setTagFilterIds([])
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={
                filtered.length > 0 &&
                filtered.every((txn) => selectedIds.has(txn.id))
              }
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkActions(!showBulkActions)}
            >
              <Tags className="mr-2 size-4" />
              Bulk Tag Edit
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Tag Actions */}
      {showBulkActions && selectedIds.size > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-medium">Bulk Tag Update</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowBulkActions(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1">
              <TagSelector
                availableTags={tags}
                selectedTagIds={bulkTagIds}
                onChange={setBulkTagIds}
                onCreateTag={createInlineTag}
                title="Select Tags"
                triggerLabel="Choose tags"
                emptyLabel="No tags selected"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => void runBulkTagMutation('add')}
                disabled={bulkSaving !== null}
              >
                {bulkSaving === 'add' ? 'Adding...' : 'Add Tags'}
              </Button>
              <Button
                variant="outline"
                onClick={() => void runBulkTagMutation('remove')}
                disabled={bulkSaving !== null}
              >
                {bulkSaving === 'remove' ? 'Removing...' : 'Remove Tags'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transactions List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <Clock className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No transactions found</p>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or import more statements
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDate.map(([date, txns]) => (
            <DateGroup
              key={date}
              date={date}
              transactions={txns}
              categoryMap={categoryMap}
              accountMap={accountMap}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelected}
              onEditCategory={(txn) => openEditor(txn, 'category')}
              onEditTags={(txn) => openEditor(txn, 'tags')}
            />
          ))}
        </div>
      )}

      {/* Transaction Editor Sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-xl"
          onOpenAutoFocus={(event) => {
            if (!editorFocusTarget) return
            event.preventDefault()
            const selector =
              editorFocusTarget === 'category'
                ? '[data-editor-focus-target="category"]'
                : '[data-editor-focus-target="tags"]'
            const container = event.currentTarget as HTMLElement | null
            const target =
              container?.querySelector<HTMLElement>(selector) ?? null
            target?.focus()
          }}
        >
          <SheetHeader>
            <SheetTitle>Edit Transaction</SheetTitle>
            <SheetDescription>
              Update category, tags, and transfer links
            </SheetDescription>
          </SheetHeader>
          {editingTxn && (
            <div className="mt-6 space-y-6">
              {/* Transaction Summary */}
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex size-12 items-center justify-center rounded-xl',
                      normalizeTxnDirection(editingTxn.txn_type) === 'credit'
                        ? 'bg-income/10'
                        : 'bg-expense/10'
                    )}
                  >
                    {normalizeTxnDirection(editingTxn.txn_type) === 'credit' ? (
                      <ArrowDownRight className="size-6 text-income" />
                    ) : (
                      <ArrowUpRight className="size-6 text-expense" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {editingTxn.merchant_normalized ??
                        editingTxn.merchant_raw ??
                        'Unknown'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(editingTxn.txn_date)} -{' '}
                      {getAccountName(accountMap[editingTxn.account_id])}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-lg font-semibold',
                      normalizeTxnDirection(editingTxn.txn_type) === 'credit'
                        ? 'text-income'
                        : 'text-expense'
                    )}
                  >
                    {normalizeTxnDirection(editingTxn.txn_type) === 'credit'
                      ? '+'
                      : '-'}
                    {formatCurrency(Math.abs(editingTxn.amount))}
                  </span>
                </div>
              </div>

              {/* Category */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Category</p>
                  <p className="text-xs text-muted-foreground">
                    Assign a category for this transaction
                  </p>
                </div>
                <Select
                  value={
                    editingCategoryId != null
                      ? String(editingCategoryId)
                      : UNCATEGORIZED_VALUE
                  }
                  onValueChange={(value) => {
                    setEditingCategoryId(
                      value === UNCATEGORIZED_VALUE ? null : Number(value)
                    )
                  }}
                >
                  <SelectTrigger data-editor-focus-target="category">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCATEGORIZED_VALUE}>
                      Uncategorized
                    </SelectItem>
                    {incompatibleCurrentCategory && (
                      <>
                        <SelectSeparator />
                        <SelectGroup>
                          <SelectLabel>Current selection</SelectLabel>
                          <SelectItem
                            value={String(incompatibleCurrentCategory.id)}
                            disabled
                          >
                            <span className="flex items-center gap-2">
                              <CategoryIcon
                                {...incompatibleCurrentCategory}
                                className="size-3.5"
                              />
                              <span>
                                {incompatibleCurrentCategory.name} (incompatible)
                              </span>
                            </span>
                          </SelectItem>
                        </SelectGroup>
                      </>
                    )}
                    {groupedEditorCategories.map((typeGroup, typeIndex) => (
                      <div key={typeGroup.type}>
                        {(typeIndex > 0 || incompatibleCurrentCategory) && (
                          <SelectSeparator />
                        )}
                        <SelectGroup>
                          <SelectLabel>{typeGroup.label}</SelectLabel>
                          {typeGroup.groups.map(([groupName, groupCategories]) => (
                            <div key={`${typeGroup.type}:${groupName}`}>
                              <SelectLabel className="pl-4 text-[11px]">
                                {groupName}
                              </SelectLabel>
                              {groupCategories.map((category) => (
                                <SelectItem
                                  key={category.id}
                                  value={String(category.id)}
                                >
                                  <span className="flex items-center gap-2">
                                    <CategoryIcon
                                      {...category}
                                      className="size-3.5"
                                    />
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

              {/* Transfer Link */}
              {isEditingInternalTransferCategory && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Transfer Counterpart</p>
                      <p className="text-xs text-muted-foreground">
                        Link to matching transaction
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingTransferTargetId(null)}
                      disabled={!editingTransferTargetId}
                    >
                      Clear
                    </Button>
                  </div>

                  {editingTransferSummary ? (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center gap-2">
                        <Check className="size-4 text-income" />
                        <span className="font-medium">
                          {editingTransferSummary.directionLabel}{' '}
                          {editingTransferSummary.counterpartAccountName}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {editingTransferSummary.counterpartDisplayName} -{' '}
                        {formatDate(editingTransferSummary.counterpartTxnDate)} -{' '}
                        {formatCurrency(
                          Math.abs(editingTransferSummary.counterpartAmount)
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No counterpart linked
                    </p>
                  )}

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={transferSearch}
                      onChange={(event) => setTransferSearch(event.target.value)}
                      placeholder="Search counterpart..."
                      className="pl-9"
                    />
                  </div>

                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {internalTransferCandidates.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted-foreground">
                        No eligible transactions found
                      </p>
                    ) : (
                      internalTransferCandidates.slice(0, 10).map((candidate) => {
                        const isSelected =
                          candidate.id === editingTransferTargetId
                        const hasOppositeDirection =
                          normalizeTxnDirection(candidate.txn_type) !==
                          normalizeTxnDirection(editingTxn.txn_type)

                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                              isSelected
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-muted',
                              !hasOppositeDirection && 'opacity-50'
                            )}
                            onClick={() =>
                              hasOppositeDirection &&
                              setEditingTransferTargetId(candidate.id)
                            }
                            disabled={!hasOppositeDirection}
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {candidate.merchant_normalized ??
                                  candidate.merchant_raw ??
                                  'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {getAccountName(
                                  accountMap[candidate.account_id]
                                )}{' '}
                                - {formatDate(candidate.txn_date)}
                              </p>
                            </div>
                            <span className="text-sm font-medium">
                              {formatCurrency(Math.abs(candidate.amount))}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Tags */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Tags</p>
                  <p className="text-xs text-muted-foreground">
                    Add labels to organize this transaction
                  </p>
                </div>
                <TagSelector
                  availableTags={tags}
                  selectedTagIds={editingTagIds}
                  onChange={setEditingTagIds}
                  onCreateTag={createInlineTag}
                  title="Edit Tags"
                  triggerLabel="Choose tags"
                  triggerFocusTarget="tags"
                />
              </div>
            </div>
          )}
          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveTransactionEdits()}
              disabled={savingEditor}
            >
              {savingEditor ? 'Saving...' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
