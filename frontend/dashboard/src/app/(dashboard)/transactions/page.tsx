'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock, Loader2, Search, Shapes, Tags } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { isApprovedMappingStatus } from '@/lib/statement-linking/config'
import { cn } from '@/lib/utils'
import { CategoryBadge } from '@/components/category-badge'
import { CategoryIcon } from '@/components/category-icon'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { TagSelector } from '@/components/tag-selector'
import { isPaymentCategoryTypeCompatible, normalizeTxnDirection } from '@/lib/transactions/category-compatibility'
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
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
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
    return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
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
    }]
  })
}

function dedupeTransferLinks(links: InternalTransferLinkRecord[]) {
  const seen = new Set<string>()
  return links.filter((link) => {
    const key = link.id ?? `${link.fromTransactionId}:${link.toTransactionId}:${link.linkType ?? 'internal_transfer'}`
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
  return transferLinks.length === 0
    ? null
    : buildInternalTransferLinkSummaryFromResolved(transactionId, transactionsById, accountsById, transferLinks)
}

function buildInternalTransferLinkSummaryFromResolved(
  transactionId: string,
  transactionsById: Record<string, InternalTransferTransactionLike>,
  accountsById: Record<string, { id: string; name: string | null }>,
  transferLinks: InternalTransferLinkRecord[],
) {
  const sourceTransaction = transactionsById[transactionId]
  if (!sourceTransaction) return null

  const link = transferLinks.find((candidate) => (
    candidate.fromTransactionId === transactionId || candidate.toTransactionId === transactionId
  ))
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

async function loadInternalTransferLinks(
  supabase: ReturnType<typeof createClient>,
  transactionIds: string[],
) {
  if (transactionIds.length === 0) return []

  const [outgoingResult, incomingResult] = await Promise.all([
    supabase
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status')
      .eq('link_type', 'internal_transfer')
      .in('from_transaction_id', transactionIds),
    supabase
      .from('transaction_links')
      .select('id, from_transaction_id, to_transaction_id, link_type, status')
      .eq('link_type', 'internal_transfer')
      .in('to_transaction_id', transactionIds),
  ])

  if (outgoingResult.error) throw new Error(outgoingResult.error.message)
  if (incomingResult.error) throw new Error(incomingResult.error.message)

  return dedupeTransferLinks([
    ...normalizeTransferLinks(outgoingResult.data).filter((link) => isApprovedMappingStatus(link.status)),
    ...normalizeTransferLinks(incomingResult.data).filter((link) => isApprovedMappingStatus(link.status)),
  ])
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<StatementTxn[]>([])
  const [categories, setCategories] = useState<CategoryWithHierarchy[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [tags, setTags] = useState<TagPresentation[]>([])
  const [internalTransferLinks, setInternalTransferLinks] = useState<InternalTransferLinkRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTxn, setEditingTxn] = useState<StatementTxn | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingTagIds, setEditingTagIds] = useState<string[]>([])
  const [editingTransferTargetId, setEditingTransferTargetId] = useState<string | null>(null)
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
  const [accountFilter, setAccountFilter] = useState('all')
  const [dateRange, setDateRange] = useState('all_time')
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([])

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
          .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, description, category_id, account_id, confidence, category:categories(id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)), statement_transaction_tags(tag:tags(id, name, color_token, color_hex, icon_key, source, is_active))')
          .in('account_id', accountIds)
          .order('txn_date', { ascending: false }),
        supabase
          .from('categories')
          .select('id, name, type, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)'),
      ])

      const baseTransactions = ((txnRes.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        ...(row as unknown as Omit<StatementTxn, 'tags' | 'internalTransferLink'>),
        tags: flattenTags(row.statement_transaction_tags),
        internalTransferLink: null,
      }))

      const transferLinks = await loadInternalTransferLinks(
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
      setTransferSearch('')
    }
  }, [editorOpen])

  const accountMap = useMemo(() => Object.fromEntries(accounts.map((account) => [account.id, account])), [accounts])
  const categoryMap = useMemo(() => Object.fromEntries(categories.map((category) => [category.id, category])), [categories])
  const linkedCounterpartByTransactionId = useMemo(() => {
    const pairs = new Map<string, string>()
    for (const link of internalTransferLinks) {
      pairs.set(link.fromTransactionId, link.toTransactionId)
      pairs.set(link.toTransactionId, link.fromTransactionId)
    }
    return pairs
  }, [internalTransferLinks])
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
  const groupedEditorCategories = useMemo(
    () => getGroupedEditorCategories(compatibleEditorCategories),
    [compatibleEditorCategories],
  )
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
  const isEditingInternalTransferCategory = useMemo(
    () => isInternalTransferCategoryName(currentEditorCategory?.name),
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
  const internalTransferCandidates = useMemo(() => {
    if (!editingTxn) return []

    const normalizedSearch = transferSearch.trim().toLowerCase()

    return [...transactions]
      .filter((candidate) => candidate.id !== editingTxn.id)
      .filter((candidate) => candidate.account_id !== editingTxn.account_id)
      .filter((candidate) => {
        const linkedCounterpartId = linkedCounterpartByTransactionId.get(candidate.id)
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

        return searchableValues.some((value) => String(value ?? '').toLowerCase().includes(normalizedSearch))
      })
      .sort((left, right) => compareInternalTransferCandidates(
        toInternalTransferTransaction(editingTxn),
        toInternalTransferTransaction(left),
        toInternalTransferTransaction(right),
      ))
  }, [accountMap, editingTxn, linkedCounterpartByTransactionId, transactions, transferSearch])

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
        const merchant = txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? ''
        if (search && !merchant.toLowerCase().includes(search.toLowerCase())) return false
        if (typeFilter !== 'all' && normalizeTxnDirection(txn.txn_type) !== typeFilter) return false
        const txnCategory = txn.category
        if (groupFilter !== 'all' && String(txnCategory?.group_id ?? '') !== groupFilter) return false
        if (subgroupFilter !== 'all' && String(txnCategory?.subgroup_id ?? '') !== subgroupFilter) return false
        if (categoryFilter !== 'all' && String(txnCategory?.id ?? '') !== categoryFilter) return false
        if (accountFilter !== 'all' && txn.account_id !== accountFilter) return false
        if (rangeStart && txn.txn_date < rangeStart) return false
        if (rangeEnd && txn.txn_date > rangeEnd) return false
        if (tagFilterIds.length > 0 && !tagFilterIds.every((tagId) => txn.tags.some((tag) => tag.id === tagId))) return false
        return true
      })
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
  }, [transactions, search, typeFilter, groupFilter, subgroupFilter, categoryFilter, accountFilter, dateRange, tagFilterIds])

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
      if (filtered.length > 0 && filtered.every((txn) => current.has(txn.id))) return new Set()
      return new Set(filtered.map((txn) => txn.id))
    })
  }

  function openEditor(txn: StatementTxn, focusTarget: EditorFocusTarget) {
    setEditingTxn(txn)
    setEditingCategoryId(txn.category?.id ?? txn.category_id ?? null)
    setEditingTagIds(txn.tags.flatMap((tag) => (tag.id ? [tag.id] : [])))
    setEditingTransferTargetId(txn.internalTransferLink?.counterpartTransactionId ?? null)
    setTransferSearch('')
    setEditorFocusTarget(focusTarget)
    setEditorOpen(true)
  }

  function handleEditorOpenChange(open: boolean) {
    setEditorOpen(open)
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
          internalTransferTargetId: isEditingInternalTransferCategory ? editingTransferTargetId : null,
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
              linkType: 'internal_transfer',
              status: 'confirmed',
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
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
            <p className="text-sm text-muted-foreground">Filter, review, and edit final statement transactions.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{filtered.length} shown</Badge>
            <Badge variant="outline">{selectedIds.size} selected</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by merchant..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]" aria-label="Transaction type">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="debit">Debit</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={groupFilter}
            onValueChange={(value) => {
              setGroupFilter(value)
              setSubgroupFilter('all')
              setCategoryFilter('all')
            }}
          >
            <SelectTrigger className="w-[160px]">
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
            <SelectTrigger className="w-[180px]">
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
            <SelectTrigger className="w-[170px]">
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
            <SelectTrigger className="w-[160px]">
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
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[150px]" aria-label="Date range">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_time">All Time</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="90_days">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tag Filters & Bulk Edit</CardTitle>
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
                  {filtered.length > 0 && filtered.every((txn) => selectedIds.has(txn.id)) ? 'Clear page selection' : 'Select page'}
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">
                      <Checkbox
                        checked={filtered.length > 0 && filtered.every((txn) => selectedIds.has(txn.id))}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select visible transactions"
                      />
                    </th>
                    <th className="pb-3 pr-4 font-medium">Date</th>
                    <th className="pb-3 pr-4 font-medium">Merchant</th>
                    <th className="pb-3 pr-4 font-medium">Category</th>
                    <th className="pb-3 pr-4 font-medium">Tags</th>
                    <th className="pb-3 pr-4 font-medium">Account</th>
                    <th className="pb-3 pr-4 text-right font-medium">Amount</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((txn) => {
                    const category = txn.category ?? (txn.category_id != null ? categoryMap[txn.category_id] : undefined)
                    const account = accountMap[txn.account_id]
                    const isCredit = normalizeTxnDirection(txn.txn_type) === 'credit'
                    const merchantName = txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? 'Unknown'

                    return (
                      <tr key={txn.id} className="border-b last:border-0">
                        <td className="py-3 pr-4 align-top">
                          <Checkbox checked={selectedIds.has(txn.id)} onCheckedChange={() => toggleSelected(txn.id)} aria-label={`Select ${merchantName}`} />
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">{formatDate(txn.txn_date)}</td>
                        <td className="py-3 pr-4 align-top">
                          <div className="space-y-1">
                            <p className="font-medium">{merchantName}</p>
                            {txn.description && txn.description !== merchantName && (
                              <p className="text-xs text-muted-foreground">{txn.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <div className="space-y-1">
                            <div>{category ? <CategoryBadge {...category} /> : '—'}</div>
                            {txn.internalTransferLink && (
                              <p className="text-xs text-muted-foreground">
                                Transfer {txn.internalTransferLink.directionLabel} {txn.internalTransferLink.counterpartAccountName ?? 'linked account'}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 pr-4 align-top">
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {txn.tags.length > 0 ? txn.tags.map((tag) => <TagBadge key={tag.id ?? tag.name} {...tag} className="text-[11px]" />) : <span className="text-xs text-muted-foreground">No tags</span>}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{getAccountName(account)}</td>
                        <td className="py-3 pr-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {txn.confidence > 0 && txn.confidence < 0.9 && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                <Clock className="size-3" />
                                Low conf
                              </Badge>
                            )}
                            <span className={cn('font-medium', isCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                              {isCredit ? '+' : '-'}
                              {formatCurrency(Math.abs(txn.amount))}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  aria-label="Edit category"
                                  onClick={() => openEditor(txn, 'category')}
                                >
                                  <Shapes className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit category</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon-sm"
                                  variant="outline"
                                  aria-label="Edit tags"
                                  onClick={() => openEditor(txn, 'tags')}
                                >
                                  <Tags className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit tags</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No transactions found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Sheet open={editorOpen} onOpenChange={handleEditorOpenChange}>
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
              <SheetDescription>Update the category, tags, and internal transfer counterpart for this transaction.</SheetDescription>
            </SheetHeader>
            {editingTxn && (
              <div className="mt-6 space-y-6">
                <div className="rounded-md border p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{editingTxn.merchant_normalized ?? editingTxn.merchant_raw ?? 'Unknown merchant'}</p>
                      <p className="text-muted-foreground">{formatDate(editingTxn.txn_date)}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <CategoryBadge
                        {...(currentEditorCategory ?? {})}
                        name={currentEditorCategory?.name ?? null}
                        fallbackLabel="Uncategorized"
                      />
                      <Badge variant="outline" className="gap-1">
                        <Tags className="size-3.5" />
                        {editingTagIds.length} selected
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Category</p>
                    <p className="text-xs text-muted-foreground">Assign a compatible category or clear it to uncategorized.</p>
                  </div>
                  <Select
                    value={editingCategoryId != null ? String(editingCategoryId) : UNCATEGORIZED_VALUE}
                    onValueChange={(value) => {
                      setEditingCategoryId(value === UNCATEGORIZED_VALUE ? null : Number(value))
                    }}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-label="Transaction category"
                      data-editor-focus-target="category"
                    >
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNCATEGORIZED_VALUE}>Uncategorized</SelectItem>
                      {incompatibleCurrentCategory && (
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
                      )}
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

                {isEditingInternalTransferCategory && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Transfer counterpart</p>
                        <p className="text-xs text-muted-foreground">Pick the matching committed transaction from another account.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTransferTargetId(null)}
                        disabled={!editingTransferTargetId}
                      >
                        Clear
                      </Button>
                    </div>

                    <div className="rounded-md border p-3 text-sm">
                      {editingTransferSummary ? (
                        <div className="space-y-1">
                          <p className="font-medium">
                            Transfer {editingTransferSummary.directionLabel} {editingTransferSummary.counterpartAccountName ?? 'linked account'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {editingTransferSummary.counterpartDisplayName ?? 'Unknown merchant'} • {formatDate(editingTransferSummary.counterpartTxnDate)} • {formatCurrency(Math.abs(editingTransferSummary.counterpartAmount))}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">No counterpart selected.</p>
                      )}
                    </div>

                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={transferSearch}
                        onChange={(event) => setTransferSearch(event.target.value)}
                        placeholder="Search transfer counterpart"
                        className="pl-9"
                      />
                    </div>

                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {internalTransferCandidates.map((candidate) => {
                        const candidateAccountName = getAccountName(accountMap[candidate.account_id])
                        const candidateMerchantName = candidate.merchant_normalized ?? candidate.merchant_raw ?? candidate.description ?? 'Unknown'
                        const isSelected = candidate.id === editingTransferTargetId
                        const hasOppositeDirection = normalizeTxnDirection(candidate.txn_type) !== normalizeTxnDirection(editingTxn.txn_type)

                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            className={cn(
                              'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left',
                              isSelected && 'border-primary bg-primary/5',
                              !hasOppositeDirection && 'opacity-60',
                            )}
                            onClick={() => hasOppositeDirection && setEditingTransferTargetId(candidate.id)}
                            disabled={!hasOppositeDirection}
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
                              {!hasOppositeDirection && (
                                <span className="text-[11px] text-muted-foreground">Same direction</span>
                              )}
                            </div>
                          </button>
                        )
                      })}

                      {internalTransferCandidates.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          No eligible counterpart transactions match this search.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Tags</p>
                    <p className="text-xs text-muted-foreground">Add or remove tags, or create new ones inline.</p>
                  </div>
                  <TagSelector
                    availableTags={tags}
                    selectedTagIds={editingTagIds}
                    onChange={setEditingTagIds}
                    onCreateTag={createInlineTag}
                    title="Edit Transaction Tags"
                    triggerLabel="Choose tags"
                    triggerFocusTarget="tags"
                  />
                </div>

                <Button onClick={() => void saveTransactionEdits()} disabled={savingEditor} className="w-full">
                  {savingEditor ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  )
}
