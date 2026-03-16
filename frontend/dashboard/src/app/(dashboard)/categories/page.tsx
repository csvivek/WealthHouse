'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Eye,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Search,
} from 'lucide-react'
import { ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { CategoryColorDot } from '@/components/category-color-dot'
import { CategoryIcon } from '@/components/category-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'

type Domain = 'receipt' | 'payment'
type PaymentSubtype = 'income' | 'expense' | 'transfer'

type CategoryRow = {
  id: string | number
  name: string
  type: string | null
  status: 'active' | 'inactive'
  household_id: string | null
  source_category_id: string | null
  isGlobal: boolean
  mappedCount: number
  icon_key: string | null
  color_token: string | null
  color_hex: string | null
  created_at: string | null
  updated_at: string | null
  effective_group_id: number | null
  effective_group_name: string | null
  effective_group_sort_order: number | null
  effective_group_archived: boolean
  effective_category_sort_order: number | null
  payment_subtype?: string | null
}

type CategoryGroup = {
  id: number
  name: string
  sort_order: number
  is_archived: boolean
  is_system_seeded: boolean
  template_key: string | null
  description?: string | null
  category_count: number
  payment_subtype?: string | null
  categories: CategoryRow[]
}

type CategoryDetails = CategoryRow & {
  description?: string | null
}

type SummaryCard = {
  testId: string
  label: string
  value: number
  subtext: string
  accentClassName: string
}

const PAYMENT_TYPE_ORDER: PaymentSubtype[] = ['expense', 'income', 'transfer']
const PAYMENT_TYPE_LABELS: Record<PaymentSubtype, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}

const RECEIPT_TYPE_FALLBACK = ['essentials', 'lifestyle', 'durables', 'health', 'family', 'mixed', 'custom']

function asNullableText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getPaymentSubtype(row: CategoryRow) {
  const candidate = row.payment_subtype ?? row.type
  return candidate === 'expense' || candidate === 'income' || candidate === 'transfer' ? candidate : null
}

function resolveAccentColor({ color_hex, color_token }: Pick<CategoryRow, 'color_hex' | 'color_token'>) {
  if (color_hex) return color_hex
  if (!color_token) return 'hsl(var(--primary) / 0.7)'
  const token = color_token.trim()
  if (token.startsWith('--')) return `var(${token})`
  return `var(--color-${token}, var(--${token}, hsl(var(--primary) / 0.7)))`
}

function normalizeRow(value: unknown): CategoryRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = typeof row.id === 'string' || typeof row.id === 'number' ? row.id : null
  const name = typeof row.name === 'string' ? row.name : null
  if (id === null || !name) return null

  return {
    id,
    name,
    type: asNullableText(row.type),
    status: row.status === 'inactive' ? 'inactive' : 'active',
    household_id: asNullableText(row.household_id),
    source_category_id: asNullableText(row.source_category_id),
    isGlobal: typeof row.isGlobal === 'boolean' ? row.isGlobal : row.household_id === null,
    mappedCount: typeof row.mappedCount === 'number' ? row.mappedCount : 0,
    icon_key: asNullableText(row.icon_key),
    color_token: asNullableText(row.color_token),
    color_hex: asNullableText(row.color_hex),
    created_at: asNullableText(row.created_at),
    updated_at: asNullableText(row.updated_at),
    effective_group_id: typeof row.effective_group_id === 'number' ? row.effective_group_id : null,
    effective_group_name: asNullableText(row.effective_group_name),
    effective_group_sort_order: typeof row.effective_group_sort_order === 'number' ? row.effective_group_sort_order : null,
    effective_group_archived: Boolean(row.effective_group_archived),
    effective_category_sort_order: typeof row.effective_category_sort_order === 'number' ? row.effective_category_sort_order : null,
    payment_subtype: asNullableText(row.payment_subtype),
  }
}

function normalizeGroup(value: unknown): CategoryGroup | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.name !== 'string') return null
  const categories = Array.isArray(row.categories)
    ? row.categories.map((item) => normalizeRow(item)).filter((item): item is CategoryRow => Boolean(item))
    : []

  return {
    id: row.id,
    name: row.name,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    is_archived: Boolean(row.is_archived),
    is_system_seeded: Boolean(row.is_system_seeded),
    template_key: asNullableText(row.template_key),
    description: asNullableText(row.description),
    category_count: typeof row.category_count === 'number' ? row.category_count : categories.length,
    payment_subtype: asNullableText(row.payment_subtype),
    categories,
  }
}

function normalizeDetails(value: unknown): CategoryDetails | null {
  const row = normalizeRow(value)
  if (!row) return null
  const payload = value as Record<string, unknown>
  return {
    ...row,
    description: asNullableText(payload.description),
  }
}

function formatTypeLabel(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function CategoriesPage() {
  const [domain, setDomain] = useState<Domain>('payment')
  const [paymentSubtype, setPaymentSubtype] = useState<PaymentSubtype>('expense')
  const [searchInput, setSearchInput] = useState('')
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [groups, setGroups] = useState<CategoryGroup[]>([])
  const [ungrouped, setUngrouped] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const [viewDetails, setViewDetails] = useState<CategoryDetails | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryType, setCategoryType] = useState('')
  const [categoryGroupId, setCategoryGroupId] = useState<string>('')

  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [groupSaving, setGroupSaving] = useState(false)
  const [editingGroup, setEditingGroup] = useState<CategoryGroup | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupSubtype, setGroupSubtype] = useState<PaymentSubtype>('expense')

  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [movingCategory, setMovingCategory] = useState<CategoryRow | null>(null)
  const [moveTargetGroupId, setMoveTargetGroupId] = useState<string>('')

  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false)
  const [deletingGroup, setDeletingGroup] = useState<CategoryGroup | null>(null)
  const [deleteTargetGroupId, setDeleteTargetGroupId] = useState<string>('')
  const [deleteGroupSaving, setDeleteGroupSaving] = useState(false)

  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeRow, setMergeRow] = useState<CategoryRow | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState<string>('')
  const [mergeSaving, setMergeSaving] = useState(false)

  async function loadCategories() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        domain,
        view: 'grouped',
      })
      const response = await fetch(`/api/categories?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to load categories')

      const nextRows = Array.isArray(payload?.categories)
        ? (payload.categories as unknown[]).map((item) => normalizeRow(item)).filter((item): item is CategoryRow => Boolean(item))
        : []
      const nextGroups = Array.isArray(payload?.groups)
        ? (payload.groups as unknown[]).map((item) => normalizeGroup(item)).filter((item): item is CategoryGroup => Boolean(item))
        : []
      const nextUngrouped = Array.isArray(payload?.ungrouped)
        ? (payload.ungrouped as unknown[]).map((item) => normalizeRow(item)).filter((item): item is CategoryRow => Boolean(item))
        : []

      setRows(nextRows)
      setGroups(nextGroups)
      setUngrouped(nextUngrouped)
      setCollapsedGroups((current) => {
        const next = new Set<string>()
        const validIds = new Set(nextGroups.map((group) => String(group.id)))
        for (const id of current) {
          if (validIds.has(id)) next.add(id)
        }
        return next
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain])

  const normalizedSearch = searchInput.trim().toLowerCase()

  const activeGroups = useMemo(() => {
    return groups.filter((group) => {
      if (domain !== 'payment') return true
      return group.payment_subtype === paymentSubtype
    })
  }, [domain, groups, paymentSubtype])

  const visibleGroups = useMemo(() => {
    return activeGroups
      .map((group) => ({
        ...group,
        visibleCategories: normalizedSearch
          ? group.categories.filter((row) => row.name.toLowerCase().includes(normalizedSearch))
          : group.categories,
      }))
      .filter((group) => group.visibleCategories.length > 0 || !normalizedSearch)
  }, [activeGroups, normalizedSearch])

  const visibleUngrouped = useMemo(() => {
    const base = domain === 'payment'
      ? ungrouped.filter((row) => getPaymentSubtype(row) === paymentSubtype)
      : ungrouped

    return normalizedSearch
      ? base.filter((row) => row.name.toLowerCase().includes(normalizedSearch))
      : base
  }, [domain, normalizedSearch, paymentSubtype, ungrouped])

  const availableMoveTargets = useMemo(() => {
    if (!movingCategory) return []
    return activeGroups.filter((group) => group.id !== movingCategory.effective_group_id)
  }, [activeGroups, movingCategory])

  const deleteGroupTargets = useMemo(() => {
    if (!deletingGroup) return []
    return activeGroups.filter((group) => {
      if (group.id === deletingGroup.id) return false
      if (domain !== 'payment') return true
      return group.payment_subtype === deletingGroup.payment_subtype
    })
  }, [activeGroups, deletingGroup, domain])

  const mergeTargets = useMemo(() => {
    if (!mergeRow) return []
    const normalizedMergeSearch = mergeSearch.trim().toLowerCase()
    return rows
      .filter((row) => String(row.id) !== String(mergeRow.id))
      .filter((row) => !normalizedMergeSearch || row.name.toLowerCase().includes(normalizedMergeSearch))
      .map((row) => ({
        row,
        compatible: domain === 'receipt' || row.type === mergeRow.type,
      }))
  }, [domain, mergeRow, mergeSearch, rows])

  const receiptTypeOptions = useMemo(() => {
    const dynamic = rows
      .map((row) => row.type?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))

    return Array.from(new Set([...dynamic, ...RECEIPT_TYPE_FALLBACK])).map((value) => ({
      value,
      label: formatTypeLabel(value),
    }))
  }, [rows])

  const categoryGroupOptions = useMemo(() => {
    return activeGroups.filter((group) => {
      if (domain !== 'payment') return true
      return !categoryType || group.payment_subtype === categoryType
    })
  }, [activeGroups, categoryType, domain])

  const summaryCards = useMemo<SummaryCard[]>(() => {
    const mappedCategoryCount = rows.filter((row) => row.mappedCount > 0).length
    const mappedRecordCount = rows.reduce((sum, row) => sum + row.mappedCount, 0)

    return [
      {
        testId: 'stat-total-groups',
        label: 'Total Groups',
        value: groups.length,
        subtext: domain === 'payment' ? 'Across payment subtypes' : 'Across receipt category sets',
        accentClassName: 'text-amber-300',
      },
      {
        testId: 'stat-total-categories',
        label: 'Total Categories',
        value: rows.length,
        subtext: domain === 'payment' ? 'Expense, income, and transfer' : 'Household and inherited receipt categories',
        accentClassName: 'text-sky-300',
      },
      {
        testId: 'stat-mapped',
        label: 'Mapped',
        value: mappedCategoryCount,
        subtext: `${mappedRecordCount} linked records`,
        accentClassName: 'text-emerald-300',
      },
      {
        testId: 'stat-unmapped',
        label: 'Unmapped',
        value: rows.length - mappedCategoryCount,
        subtext: 'No linked records yet',
        accentClassName: 'text-violet-300',
      },
    ]
  }, [domain, groups.length, rows])

  const hasVisibleResults = visibleGroups.length > 0 || visibleUngrouped.length > 0

  function toggleGroupCard(groupId: number) {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      const key = String(groupId)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openCreateGroup(subtype?: PaymentSubtype) {
    setEditingGroup(null)
    setGroupName('')
    setGroupSubtype(subtype ?? 'expense')
    setGroupDialogOpen(true)
  }

  function openEditGroup(group: CategoryGroup) {
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupSubtype((group.payment_subtype as PaymentSubtype | null) ?? 'expense')
    setGroupDialogOpen(true)
  }

  function openCreateCategory(group?: CategoryGroup) {
    setEditingCategory(null)
    setCategoryName('')
    setCategoryType(domain === 'payment' ? (group?.payment_subtype ?? paymentSubtype) : 'custom')
    setCategoryGroupId(group ? String(group.id) : '')
    setCategoryDialogOpen(true)
  }

  function openEditCategory(row: CategoryRow) {
    setEditingCategory(row)
    setCategoryName(row.name)
    setCategoryType(row.type || (domain === 'payment' ? 'expense' : 'custom'))
    setCategoryGroupId(row.effective_group_id != null ? String(row.effective_group_id) : '')
    setCategoryDialogOpen(true)
  }

  async function openView(row: CategoryRow) {
    setViewDetails({ ...row, description: null })
    setViewOpen(true)
    setViewLoading(true)
    try {
      const response = await fetch(`/api/categories/${domain}/${row.id}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to load category details')
      const details = normalizeDetails(payload?.category)
      if (details) {
        setViewDetails({
          ...details,
          mappedCount: row.mappedCount,
          status: row.status,
          household_id: row.household_id,
          source_category_id: row.source_category_id,
          isGlobal: row.isGlobal,
          effective_group_id: row.effective_group_id,
          effective_group_name: row.effective_group_name,
          effective_group_sort_order: row.effective_group_sort_order,
          effective_group_archived: row.effective_group_archived,
          effective_category_sort_order: row.effective_category_sort_order,
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load category details')
    } finally {
      setViewLoading(false)
    }
  }

  async function saveGroup() {
    const name = groupName.trim()
    if (!name) {
      toast.error('Group name is required')
      return
    }

    setGroupSaving(true)
    try {
      const url = editingGroup
        ? `/api/category-groups/${domain}/${editingGroup.id}`
        : '/api/category-groups'
      const method = editingGroup ? 'PATCH' : 'POST'
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain,
          name,
          payment_subtype: domain === 'payment' ? groupSubtype : undefined,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to save group')
      toast.success(editingGroup ? 'Group updated' : 'Group created')
      setGroupDialogOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save group')
    } finally {
      setGroupSaving(false)
    }
  }

  async function toggleArchiveGroup(group: CategoryGroup) {
    try {
      const response = await fetch(`/api/category-groups/${domain}/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: !group.is_archived }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to update group')
      toast.success(group.is_archived ? 'Group restored' : 'Group archived')
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update group')
    }
  }

  async function moveGroup(group: CategoryGroup, direction: 'up' | 'down') {
    const peerGroups = activeGroups
      .filter((item) => (domain === 'payment' ? item.payment_subtype === group.payment_subtype : true))
      .sort((left, right) => left.sort_order - right.sort_order)
    const index = peerGroups.findIndex((item) => item.id === group.id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || targetIndex < 0 || targetIndex >= peerGroups.length) return

    const reordered = [...peerGroups]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    try {
      const response = await fetch(`/api/category-groups/${domain}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: reordered.map((item) => item.id) }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to reorder groups')
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reorder groups')
    }
  }

  async function saveCategory() {
    const name = categoryName.trim()
    if (!name) {
      toast.error('Category name is required')
      return
    }

    setCategorySaving(true)
    try {
      const response = await fetch(
        editingCategory ? `/api/categories/${domain}/${editingCategory.id}` : '/api/categories',
        {
          method: editingCategory ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain,
            name,
            type: categoryType || null,
            effective_group_id: categoryGroupId ? Number(categoryGroupId) : null,
            groupId: categoryGroupId ? Number(categoryGroupId) : null,
            groupName: activeGroups.find((group) => String(group.id) === categoryGroupId)?.name ?? null,
          }),
        },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to save category')
      toast.success(editingCategory ? 'Category updated' : 'Category created')
      setCategoryDialogOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save category')
    } finally {
      setCategorySaving(false)
    }
  }

  async function saveMoveCategory() {
    if (!movingCategory || !moveTargetGroupId) {
      toast.error('Select a target group')
      return
    }

    try {
      const response = await fetch(`/api/category-groups/${domain}/memberships`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetGroupId: Number(moveTargetGroupId),
          categoryIds: [movingCategory.id],
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to move category')
      toast.success('Category moved')
      setMoveDialogOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to move category')
    }
  }

  async function runMerge() {
    if (!mergeRow || !mergeTargetId) {
      toast.error('Select a target category')
      return
    }

    setMergeSaving(true)
    try {
      const response = await fetch(`/api/categories/${domain}/${mergeRow.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: mergeTargetId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Merge failed')
      toast.success('Category merged')
      setMergeOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Merge failed')
    } finally {
      setMergeSaving(false)
    }
  }

  async function runDeleteCategory(row: CategoryRow) {
    const confirmed = confirm(`Delete category "${row.name}"?`)
    if (!confirmed) return
    try {
      const response = await fetch(`/api/categories/${domain}/${row.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Delete failed')
      toast.success('Category deleted')
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed')
    }
  }

  async function runDeleteGroup() {
    if (!deletingGroup) return
    setDeleteGroupSaving(true)
    try {
      const suffix = deleteTargetGroupId ? `?targetGroupId=${deleteTargetGroupId}` : ''
      const response = await fetch(`/api/category-groups/${domain}/${deletingGroup.id}${suffix}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete group')
      toast.success('Group deleted')
      setDeleteGroupOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete group')
    } finally {
      setDeleteGroupSaving(false)
    }
  }

  function renderCategoryRow(row: CategoryRow) {
    const typeLabel = domain === 'payment'
      ? PAYMENT_TYPE_LABELS[getPaymentSubtype(row) ?? 'expense']
      : formatTypeLabel(row.type || 'custom')

    return (
      <div
        key={String(row.id)}
        data-testid={`category-row-${String(row.id)}`}
        className="group/row flex items-center gap-3 bg-background/55 px-4 py-3 transition hover:bg-background/80"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CategoryColorDot color_token={row.color_token} color_hex={row.color_hex} className="size-2.5" />
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card/70">
            <CategoryIcon icon_key={row.icon_key} className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span>{typeLabel}</span>
              {row.updated_at ? <span>Updated {formatDate(row.updated_at)}</span> : null}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              'text-[11px] font-medium',
              row.mappedCount > 0 ? 'text-emerald-300' : 'text-muted-foreground',
            )}
          >
            {row.mappedCount > 0 ? `${row.mappedCount} mapped` : 'Unmapped'}
          </span>
          <div className="flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover/row:opacity-100 md:group-focus-within/row:opacity-100">
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-border/60 hover:bg-card hover:text-foreground"
              onClick={() => openEditCategory(row)}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-border/60 hover:bg-card hover:text-foreground"
              onClick={() => {
                setMergeRow(row)
                setMergeSearch('')
                setMergeTargetId('')
                setMergeOpen(true)
              }}
            >
              Merge
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void runDeleteCategory(row)}
            >
              Remove
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                  aria-label={`More actions for ${row.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => void openView(row)}>
                  <Eye className="size-4" />
                  View details
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setMovingCategory(row)
                    setMoveTargetGroupId('')
                    setMoveDialogOpen(true)
                  }}
                >
                  Move category
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    )
  }

  function renderGroupCard(group: CategoryGroup & { visibleCategories: CategoryRow[] }) {
    const isCollapsed = collapsedGroups.has(String(group.id))
    const primaryCategory = group.categories[0] ?? null
    const accentColor = primaryCategory ? resolveAccentColor(primaryCategory) : 'hsl(var(--primary) / 0.72)'
    const mappedCategories = group.categories.filter((row) => row.mappedCount > 0).length
    const coverage = group.categories.length > 0 ? Math.round((mappedCategories / group.categories.length) * 100) : 0
    const categoryCountLabel = normalizedSearch
      ? `${group.visibleCategories.length} of ${group.categories.length} categories`
      : `${group.categories.length} categories`

    return (
      <section
        key={group.id}
        data-testid={`group-card-${group.id}`}
        className="group/card overflow-hidden rounded-[1.4rem] border border-border/70 bg-[linear-gradient(180deg,rgba(16,23,35,0.96),rgba(10,15,25,0.98))] shadow-[0_20px_70px_rgba(3,7,18,0.26)]"
      >
        <div className="flex items-start gap-3 border-b border-border/60 px-4 py-4 sm:px-5" style={{ borderLeft: `3px solid ${accentColor}` }}>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-3 text-left"
            onClick={() => toggleGroupCard(group.id)}
            aria-expanded={!isCollapsed}
          >
            <ChevronRight
              className={cn(
                'mt-2 size-4 shrink-0 text-muted-foreground transition-transform',
                !isCollapsed && 'rotate-90',
              )}
            />
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-background/70"
              style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accentColor} 40%, transparent)` }}
            >
              {primaryCategory ? (
                <CategoryIcon icon_key={primaryCategory.icon_key} className="size-4" />
              ) : (
                <Folder className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold tracking-[-0.02em] text-foreground">{group.name}</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {domain === 'payment'
                  ? `${formatTypeLabel(group.payment_subtype || 'expense')} group`
                  : 'Receipt group'}
              </p>
            </div>
          </button>

          <div className="hidden min-w-[140px] flex-col items-end gap-2 sm:flex">
            <span className="rounded-full border border-border/70 bg-background/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              {categoryCountLabel}
            </span>
            <div className="flex w-full items-center justify-end gap-2">
              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-background/80">
                <div className="h-full rounded-full" style={{ width: `${coverage}%`, backgroundColor: accentColor }} />
              </div>
              <span className="min-w-8 text-right text-[11px] text-muted-foreground">{coverage}%</span>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover/card:opacity-100 md:group-focus-within/card:opacity-100">
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-amber-300 transition hover:border-amber-400/30 hover:bg-amber-400/10"
              onClick={() => openCreateCategory(group)}
            >
              Add
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-border/60 hover:bg-card hover:text-foreground"
              onClick={() => openEditGroup(group)}
            >
              Rename
            </button>
            <button
              type="button"
              className="rounded-md border border-transparent px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setDeletingGroup(group)
                setDeleteTargetGroupId('')
                setDeleteGroupOpen(true)
              }}
            >
              Delete
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
                  aria-label={`More actions for group ${group.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => void moveGroup(group, 'up')}>
                  <ArrowUp className="size-4" />
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void moveGroup(group, 'down')}>
                  <ArrowDown className="size-4" />
                  Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void toggleArchiveGroup(group)}>
                  {group.is_archived ? 'Restore group' : 'Archive group'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {!isCollapsed ? (
          <div className="p-4 sm:p-5">
            {group.visibleCategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-5 text-sm text-muted-foreground">
                No categories in this group yet.
              </div>
            ) : (
              <div className="grid overflow-hidden rounded-xl border border-border/70 bg-border/60 md:grid-cols-2">
                {group.visibleCategories.map(renderCategoryRow)}
              </div>
            )}
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <ExecutivePage className="space-y-6">
      <ExecutivePageHeader
        eyebrow="Manage Workspace"
        title="Category Management"
        description="Organize payment and receipt categories with grouped maintenance controls, domain-level summaries, and denser inline editing."
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.testId}
            data-testid={card.testId}
            className="rounded-[1.35rem] border border-border/70 bg-[linear-gradient(180deg,rgba(18,26,40,0.94),rgba(11,17,27,0.98))] px-4 py-4 shadow-[0_18px_60px_rgba(3,7,18,0.22)]"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{card.label}</p>
            <p data-testid={`${card.testId}-value`} className={cn('mt-3 text-3xl font-semibold tracking-[-0.04em]', card.accentClassName)}>
              {card.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{card.subtext}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[1.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(16,23,35,0.96),rgba(10,15,25,0.98))] p-4 shadow-[0_20px_70px_rgba(3,7,18,0.24)] sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Select value={domain} onValueChange={(value: Domain) => setDomain(value)}>
            <SelectTrigger className="w-full xl:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="payment">Payment categories</SelectItem>
              <SelectItem value="receipt">Receipt categories</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative w-full xl:max-w-sm xl:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search categories..."
              className="pl-9"
            />
          </div>

          <Button
            variant="outline"
            className="w-full justify-center border-amber-400/30 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15 hover:text-amber-50 xl:ml-auto xl:w-auto"
            onClick={() => openCreateGroup(domain === 'payment' ? paymentSubtype : undefined)}
          >
            <FolderPlus className="mr-2 size-4" />
            Create Group
          </Button>
        </div>

        {domain === 'payment' ? (
          <div className="mt-4">
            <Tabs value={paymentSubtype} onValueChange={(value) => setPaymentSubtype(value as PaymentSubtype)}>
              <TabsList className="h-auto w-full justify-start rounded-xl border border-border/70 bg-background/55 p-1 sm:w-fit">
                {PAYMENT_TYPE_ORDER.map((type) => (
                  <TabsTrigger key={type} value={type} className="rounded-lg px-4 py-2">
                    {PAYMENT_TYPE_LABELS[type]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
      </section>

      {loading ? (
        <div className="rounded-[1.35rem] border border-border/70 bg-card/90 px-6 py-10 text-sm text-muted-foreground">
          Loading categories...
        </div>
      ) : hasVisibleResults ? (
        <div className="space-y-4">
          {visibleGroups.map(renderGroupCard)}

          {visibleUngrouped.length > 0 ? (
            <section className="overflow-hidden rounded-[1.4rem] border border-border/70 bg-[linear-gradient(180deg,rgba(16,23,35,0.96),rgba(10,15,25,0.98))] shadow-[0_20px_70px_rgba(3,7,18,0.24)]">
              <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background/70">
                    <Folder className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold tracking-[-0.02em] text-foreground">Ungrouped</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Fallback categories without a persisted group assignment.</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => openCreateCategory()}>
                  <Plus className="mr-1 size-3.5" />
                  Add
                </Button>
              </div>
              <div className="p-4 sm:p-5">
                <div className="grid overflow-hidden rounded-xl border border-border/70 bg-border/60 md:grid-cols-2">
                  {visibleUngrouped.map(renderCategoryRow)}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="rounded-[1.35rem] border border-dashed border-border/70 bg-card/80 px-6 py-10 text-sm text-muted-foreground">
          {normalizedSearch ? 'No categories match the current search.' : 'No groups found for the current domain.'}
        </div>
      )}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Category Details</DialogTitle>
            <DialogDescription>Review category metadata and mapped usage.</DialogDescription>
          </DialogHeader>
          {!viewDetails || viewLoading ? (
            <p className="text-sm text-muted-foreground">Loading details...</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <CategoryColorDot color_token={viewDetails.color_token} color_hex={viewDetails.color_hex} className="size-2.5" />
                <CategoryIcon icon_key={viewDetails.icon_key} className="size-4" />
                <span className="font-medium">{viewDetails.name}</span>
              </div>
              <div><span className="text-muted-foreground">ID:</span> {String(viewDetails.id)}</div>
              <div><span className="text-muted-foreground">Type:</span> {viewDetails.type || '-'}</div>
              <div><span className="text-muted-foreground">Group:</span> {viewDetails.effective_group_name || '-'}</div>
              <div><span className="text-muted-foreground">Mapped:</span> {viewDetails.mappedCount}</div>
              <div><span className="text-muted-foreground">Created:</span> {viewDetails.created_at ? formatDate(viewDetails.created_at) : '-'}</div>
              <div><span className="text-muted-foreground">Updated:</span> {viewDetails.updated_at ? formatDate(viewDetails.updated_at) : '-'}</div>
              <div><span className="text-muted-foreground">Description:</span> {viewDetails.description || '-'}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
            <DialogDescription>Groups organize categories within the current domain.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Name</label>
              <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} />
            </div>
            {domain === 'payment' ? (
              <div>
                <label className="mb-1 block text-sm text-muted-foreground">Subtype</label>
                <Select value={groupSubtype} onValueChange={(value: PaymentSubtype) => setGroupSubtype(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPE_ORDER.map((option) => (
                      <SelectItem key={option} value={option}>{PAYMENT_TYPE_LABELS[option]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveGroup()} disabled={groupSaving}>
              {groupSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <DialogDescription>Create or update a category inside a household group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Name</label>
              <Input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Type</label>
              <Select value={categoryType} onValueChange={setCategoryType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(domain === 'payment'
                    ? PAYMENT_TYPE_ORDER.map((value) => ({ value, label: PAYMENT_TYPE_LABELS[value] }))
                    : receiptTypeOptions).map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Group</label>
              <Select value={categoryGroupId} onValueChange={setCategoryGroupId}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  {categoryGroupOptions.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveCategory()} disabled={categorySaving}>
              {categorySaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Category</DialogTitle>
            <DialogDescription>Select the destination group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{movingCategory?.name ?? '-'}</p>
            <Select value={moveTargetGroupId} onValueChange={setMoveTargetGroupId}>
              <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>
                {availableMoveTargets.map((group) => (
                  <SelectItem key={group.id} value={String(group.id)}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveMoveCategory()} disabled={!moveTargetGroupId}>Move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteGroupOpen} onOpenChange={setDeleteGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              {deletingGroup?.category_count
                ? 'This group still contains categories. Select a target group to move them before deletion.'
                : 'Delete this empty group.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{deletingGroup?.name ?? '-'}</p>
            {Boolean(deletingGroup?.category_count) ? (
              <Select value={deleteTargetGroupId} onValueChange={setDeleteTargetGroupId}>
                <SelectTrigger><SelectValue placeholder="Select target group" /></SelectTrigger>
                <SelectContent>
                  {deleteGroupTargets.map((group) => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroupOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => void runDeleteGroup()}
              disabled={deleteGroupSaving || (Boolean(deletingGroup?.category_count) && !deleteTargetGroupId)}
            >
              {deleteGroupSaving ? 'Deleting...' : 'Delete Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Category</DialogTitle>
            <DialogDescription>Pick a target category. The target keeps its current group.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{mergeRow?.name ?? '-'}</p>
            <Input
              value={mergeSearch}
              onChange={(event) => setMergeSearch(event.target.value)}
              placeholder="Search target category"
            />
            <div className="max-h-56 space-y-2 overflow-auto rounded-md border p-2">
              {mergeTargets.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">No target categories found.</p>
              ) : null}
              {mergeTargets.map(({ row, compatible }) => {
                const selected = mergeTargetId === String(row.id)
                return (
                  <button
                    key={String(row.id)}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!compatible}
                    onClick={() => setMergeTargetId(String(row.id))}
                  >
                    <span className="flex items-center gap-2">
                      <CategoryColorDot color_token={row.color_token} color_hex={row.color_hex} className="size-2" />
                      <CategoryIcon icon_key={row.icon_key} className="size-3.5" />
                      {row.name}
                      <span className="text-xs text-muted-foreground">({row.type || '-'})</span>
                      {row.effective_group_name ? (
                        <span className="text-xs text-muted-foreground">· {row.effective_group_name}</span>
                      ) : null}
                    </span>
                    {!compatible ? (
                      <span className="text-xs text-muted-foreground">Incompatible type</span>
                    ) : selected ? (
                      <Check className="size-4 text-primary" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={() => void runMerge()} disabled={mergeSaving || !mergeTargetId}>
              {mergeSaving ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ExecutivePage>
  )
}
