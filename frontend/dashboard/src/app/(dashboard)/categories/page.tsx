'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, FolderPlus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { CategoryColorDot } from '@/components/category-color-dot'
import { CategoryIcon } from '@/components/category-icon'
import { DATE_PERIOD_LABELS, type DatePeriod } from '@/lib/date-periods'
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
  const [period, setPeriod] = useState<DatePeriod>('all_history')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [groups, setGroups] = useState<CategoryGroup[]>([])
  const [ungrouped, setUngrouped] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(false)

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

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  async function loadCategories() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        domain,
        paymentSubtype,
        period,
        status,
        search,
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCategories()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, paymentSubtype, period, status, search])

  const visibleGroups = useMemo(() => {
    return groups.filter((group) => {
      if (domain !== 'payment') return true
      return group.payment_subtype === paymentSubtype
    })
  }, [domain, groups, paymentSubtype])

  const availableMoveTargets = useMemo(() => {
    if (!movingCategory) return []
    return visibleGroups.filter((group) => group.id !== movingCategory.effective_group_id)
  }, [movingCategory, visibleGroups])

  const deleteGroupTargets = useMemo(() => {
    if (!deletingGroup) return []
    return visibleGroups.filter((group) => {
      if (group.id === deletingGroup.id) return false
      if (domain !== 'payment') return true
      return group.payment_subtype === deletingGroup.payment_subtype
    })
  }, [deletingGroup, domain, visibleGroups])

  const mergeTargets = useMemo(() => {
    if (!mergeRow) return []
    const normalizedSearch = mergeSearch.trim().toLowerCase()
    return rows
      .filter((row) => String(row.id) !== String(mergeRow.id))
      .filter((row) => !normalizedSearch || row.name.toLowerCase().includes(normalizedSearch))
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
    const peerGroups = visibleGroups
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
            groupName: visibleGroups.find((group) => String(group.id) === categoryGroupId)?.name ?? null,
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

  const categoryGroupOptions = useMemo(() => {
    return visibleGroups.filter((group) => {
      if (domain !== 'payment') return true
      return !categoryType || group.payment_subtype === categoryType
    })
  }, [categoryType, domain, visibleGroups])

  function renderCategoryRow(row: CategoryRow) {
    return (
      <div key={String(row.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CategoryColorDot color_token={row.color_token} color_hex={row.color_hex} className="size-2.5" />
            <CategoryIcon icon_key={row.icon_key} className="size-4" />
            <span className="font-medium">{row.name}</span>
            <Badge variant={row.status === 'active' ? 'default' : 'outline'}>{row.status}</Badge>
            {domain === 'receipt' && (
              <Badge variant={row.isGlobal ? 'secondary' : 'outline'}>
                {row.isGlobal ? 'Global' : 'Household'}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{row.type || '-'}</span>
            <span>Mapped {row.mappedCount}</span>
            {row.updated_at && <span>Updated {formatDate(row.updated_at)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void openView(row)}>View</Button>
          <Button size="sm" variant="outline" onClick={() => openEditCategory(row)}>Edit</Button>
          <Button size="sm" variant="outline" onClick={() => { setMovingCategory(row); setMoveTargetGroupId(''); setMoveDialogOpen(true) }}>Move</Button>
          <Button size="sm" variant="outline" onClick={() => { setMergeRow(row); setMergeSearch(''); setMergeTargetId(''); setMergeOpen(true) }}>Merge</Button>
          <Button size="sm" variant="destructive" onClick={() => void runDeleteCategory(row)}>Delete</Button>
        </div>
      </div>
    )
  }

  function renderGroupCard(group: CategoryGroup) {
    return (
      <div key={group.id} className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{group.name}</h3>
              <Badge variant="secondary">{group.category_count}</Badge>
              {group.is_archived && <Badge variant="outline">Archived</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {domain === 'payment' ? `${formatTypeLabel(group.payment_subtype || 'expense')} group` : 'Receipt group'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => openCreateCategory(group)}>Create Category</Button>
            <Button size="icon" variant="outline" onClick={() => void moveGroup(group, 'up')}><ArrowUp className="size-4" /></Button>
            <Button size="icon" variant="outline" onClick={() => void moveGroup(group, 'down')}><ArrowDown className="size-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => openEditGroup(group)}>Rename</Button>
            <Button size="sm" variant="outline" onClick={() => void toggleArchiveGroup(group)}>
              {group.is_archived ? 'Restore' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setDeletingGroup(group)
                setDeleteTargetGroupId('')
                setDeleteGroupOpen(true)
              }}
            >
              Delete
            </Button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {group.categories.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No categories in this group yet.
            </div>
          ) : (
            group.categories.map(renderCategoryRow)
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Category Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage categories under editable household groups for payment and receipt domains.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={domain} onValueChange={(value: Domain) => setDomain(value)}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="payment">Payment categories</SelectItem>
            <SelectItem value="receipt">Receipt categories</SelectItem>
          </SelectContent>
        </Select>

        {domain === 'payment' && (
          <Select value={paymentSubtype} onValueChange={(value: PaymentSubtype) => setPaymentSubtype(value)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_TYPE_ORDER.map((type) => (
                <SelectItem key={type} value={type}>
                  {PAYMENT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={period} onValueChange={(value: DatePeriod) => setPeriod(value)}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(DATE_PERIOD_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(value: 'all' | 'active' | 'inactive') => setStatus(value)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search categories"
            className="w-[220px] pl-8"
          />
        </div>

        <Button variant="outline" onClick={() => openCreateGroup(domain === 'payment' ? paymentSubtype : undefined)}>
          <FolderPlus className="mr-2 size-4" />
          Create Group
        </Button>
      </div>

      {loading && (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">Loading categories...</div>
      )}

      {!loading && domain === 'payment' && (
        <div className="space-y-4">
          <Tabs value={paymentSubtype} onValueChange={(value) => setPaymentSubtype(value as PaymentSubtype)}>
            <TabsList>
              {PAYMENT_TYPE_ORDER.map((type) => (
                <TabsTrigger key={type} value={type}>
                  {PAYMENT_TYPE_LABELS[type]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{PAYMENT_TYPE_LABELS[paymentSubtype]}</h2>
                <p className="text-xs text-muted-foreground">
                  Editable parent groups for {PAYMENT_TYPE_LABELS[paymentSubtype].toLowerCase()}.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {visibleGroups.map(renderGroupCard)}
              {visibleGroups.length === 0 && (
                <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                  No groups found for the current filters.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {!loading && domain === 'receipt' && (
        <div className="space-y-4">
          {visibleGroups.map(renderGroupCard)}
          {visibleGroups.length === 0 && (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No groups found for the current filters.
            </div>
          )}
        </div>
      )}

      {!loading && ungrouped.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Ungrouped</h2>
            <p className="text-xs text-muted-foreground">Fallback categories without a persisted group assignment yet.</p>
          </div>
          <div className="space-y-3 rounded-lg border bg-card p-4">
            {ungrouped.map(renderCategoryRow)}
          </div>
        </section>
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
            {domain === 'payment' && (
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
            )}
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
            {Boolean(deletingGroup?.category_count) && (
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
            )}
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
              {mergeTargets.length === 0 && (
                <p className="p-2 text-sm text-muted-foreground">No target categories found.</p>
              )}
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
                      {row.effective_group_name && <span className="text-xs text-muted-foreground">· {row.effective_group_name}</span>}
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
    </div>
  )
}
