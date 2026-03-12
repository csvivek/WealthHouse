'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  FolderPlus,
  Grid3X3,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
import { Progress } from '@/components/ui/progress'
import { CategoryColorDot } from '@/components/category-color-dot'
import { CategoryIcon } from '@/components/category-icon'
import { DATE_PERIOD_LABELS, type DatePeriod } from '@/lib/date-periods'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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

const PAYMENT_TYPE_COLORS: Record<PaymentSubtype, string> = {
  income: 'bg-income/10 text-income-foreground border-income/20',
  expense: 'bg-expense/10 text-expense-foreground border-expense/20',
  transfer: 'bg-transfer/10 text-transfer-foreground border-transfer/20',
}

const RECEIPT_TYPE_FALLBACK = [
  'essentials',
  'lifestyle',
  'durables',
  'health',
  'family',
  'mixed',
  'custom',
]

function asNullableText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function normalizeRow(value: unknown): CategoryRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id =
    typeof row.id === 'string' || typeof row.id === 'number' ? row.id : null
  const name = typeof row.name === 'string' ? row.name : null
  if (id === null || !name) return null

  return {
    id,
    name,
    type: asNullableText(row.type),
    status: row.status === 'inactive' ? 'inactive' : 'active',
    household_id: asNullableText(row.household_id),
    source_category_id: asNullableText(row.source_category_id),
    isGlobal:
      typeof row.isGlobal === 'boolean'
        ? row.isGlobal
        : row.household_id === null,
    mappedCount: typeof row.mappedCount === 'number' ? row.mappedCount : 0,
    icon_key: asNullableText(row.icon_key),
    color_token: asNullableText(row.color_token),
    color_hex: asNullableText(row.color_hex),
    created_at: asNullableText(row.created_at),
    updated_at: asNullableText(row.updated_at),
    effective_group_id:
      typeof row.effective_group_id === 'number'
        ? row.effective_group_id
        : null,
    effective_group_name: asNullableText(row.effective_group_name),
    effective_group_sort_order:
      typeof row.effective_group_sort_order === 'number'
        ? row.effective_group_sort_order
        : null,
    effective_group_archived: Boolean(row.effective_group_archived),
    effective_category_sort_order:
      typeof row.effective_category_sort_order === 'number'
        ? row.effective_category_sort_order
        : null,
    payment_subtype: asNullableText(row.payment_subtype),
  }
}

function normalizeGroup(value: unknown): CategoryGroup | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'number' || typeof row.name !== 'string') return null
  const categories = Array.isArray(row.categories)
    ? row.categories
        .map((item) => normalizeRow(item))
        .filter((item): item is CategoryRow => Boolean(item))
    : []

  return {
    id: row.id,
    name: row.name,
    sort_order: typeof row.sort_order === 'number' ? row.sort_order : 0,
    is_archived: Boolean(row.is_archived),
    is_system_seeded: Boolean(row.is_system_seeded),
    template_key: asNullableText(row.template_key),
    description: asNullableText(row.description),
    category_count:
      typeof row.category_count === 'number'
        ? row.category_count
        : categories.length,
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

// Stats Card Component
function StatsCard({
  label,
  value,
  subvalue,
  trend,
  className,
}: {
  label: string
  value: string | number
  subvalue?: string
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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
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

// Category Card Component
function CategoryCard({
  category,
  onView,
  onEdit,
  onMove,
  onMerge,
  onDelete,
  domain,
  viewMode,
}: {
  category: CategoryRow
  onView: () => void
  onEdit: () => void
  onMove: () => void
  onMerge: () => void
  onDelete: () => void
  domain: Domain
  viewMode: 'grid' | 'list'
}) {
  const maxMapped = 100
  const usagePercent = Math.min((category.mappedCount / maxMapped) * 100, 100)

  if (viewMode === 'list') {
    return (
      <div className="group flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: category.color_hex
                ? `${category.color_hex}15`
                : 'var(--muted)',
            }}
          >
            <CategoryIcon
              icon_key={category.icon_key}
              className="size-5"
              style={{ color: category.color_hex || undefined }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{category.name}</span>
              {category.status === 'inactive' && (
                <Badge variant="outline" className="text-xs">
                  Inactive
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{category.mappedCount} transactions</span>
              {category.updated_at && (
                <span>Updated {formatDate(category.updated_at)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={onView}>
            View
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onMove}>Move to Group</DropdownMenuItem>
              <DropdownMenuItem onClick={onMerge}>
                Merge with Another
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-all hover:border-primary/20 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div
          className="flex size-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: category.color_hex
              ? `${category.color_hex}15`
              : 'var(--muted)',
          }}
        >
          <CategoryIcon
            icon_key={category.icon_key}
            className="size-6"
            style={{ color: category.color_hex || undefined }}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onView}>View Details</DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>Move to Group</DropdownMenuItem>
            <DropdownMenuItem onClick={onMerge}>
              Merge with Another
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h4 className="font-medium leading-tight">{category.name}</h4>
          {category.status === 'inactive' && (
            <Badge variant="outline" className="text-[10px]">
              Inactive
            </Badge>
          )}
        </div>
        {domain === 'receipt' && (
          <Badge
            variant={category.isGlobal ? 'secondary' : 'outline'}
            className="text-[10px]"
          >
            {category.isGlobal ? 'Global' : 'Household'}
          </Badge>
        )}
      </div>

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Usage</span>
          <span className="font-medium">{category.mappedCount} txns</span>
        </div>
        <Progress value={usagePercent} className="h-1.5" />
      </div>
    </div>
  )
}

// Group Card Component
function GroupCard({
  group,
  domain,
  viewMode,
  onCreateCategory,
  onEditGroup,
  onArchiveGroup,
  onMoveGroup,
  onDeleteGroup,
  onViewCategory,
  onEditCategory,
  onMoveCategory,
  onMergeCategory,
  onDeleteCategory,
}: {
  group: CategoryGroup
  domain: Domain
  viewMode: 'grid' | 'list'
  onCreateCategory: () => void
  onEditGroup: () => void
  onArchiveGroup: () => void
  onMoveGroup: (direction: 'up' | 'down') => void
  onDeleteGroup: () => void
  onViewCategory: (category: CategoryRow) => void
  onEditCategory: (category: CategoryRow) => void
  onMoveCategory: (category: CategoryRow) => void
  onMergeCategory: (category: CategoryRow) => void
  onDeleteCategory: (category: CategoryRow) => void
}) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <CollapsibleTrigger asChild>
          <div className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted">
                {isOpen ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{group.name}</h3>
                  <Badge variant="secondary" className="font-normal">
                    {group.category_count}
                  </Badge>
                  {group.is_archived && (
                    <Badge variant="outline" className="text-xs">
                      Archived
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {domain === 'payment'
                    ? `${formatTypeLabel(group.payment_subtype || 'expense')} group`
                    : 'Receipt group'}
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs"
                onClick={onCreateCategory}
              >
                <Plus className="size-3.5" />
                Add
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => onMoveGroup('up')}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                onClick={() => onMoveGroup('down')}
              >
                <ArrowDown className="size-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="size-8">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onEditGroup}>
                    <Pencil className="mr-2 size-4" />
                    Rename Group
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onArchiveGroup}>
                    {group.is_archived ? 'Restore Group' : 'Archive Group'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDeleteGroup}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    Delete Group
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-5 py-4">
            {group.categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-center">
                <div className="rounded-full bg-muted p-3">
                  <FolderPlus className="size-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  No categories in this group yet
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1"
                  onClick={onCreateCategory}
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Add Category
                </Button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.categories.map((category) => (
                  <CategoryCard
                    key={String(category.id)}
                    category={category}
                    domain={domain}
                    viewMode={viewMode}
                    onView={() => onViewCategory(category)}
                    onEdit={() => onEditCategory(category)}
                    onMove={() => onMoveCategory(category)}
                    onMerge={() => onMergeCategory(category)}
                    onDelete={() => onDeleteCategory(category)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {group.categories.map((category) => (
                  <CategoryCard
                    key={String(category.id)}
                    category={category}
                    domain={domain}
                    viewMode={viewMode}
                    onView={() => onViewCategory(category)}
                    onEdit={() => onEditCategory(category)}
                    onMove={() => onMoveCategory(category)}
                    onMerge={() => onMergeCategory(category)}
                    onDelete={() => onDeleteCategory(category)}
                  />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
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
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters] = useState(false)

  const [viewDetails, setViewDetails] = useState<CategoryDetails | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)

  const [categorySheetOpen, setCategorySheetOpen] = useState(false)
  const [categorySaving, setCategorySaving] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryRow | null>(
    null
  )
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
      const response = await fetch(`/api/categories?${params.toString()}`, {
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to load categories')

      const nextRows = Array.isArray(payload?.categories)
        ? (payload.categories as unknown[])
            .map((item) => normalizeRow(item))
            .filter((item): item is CategoryRow => Boolean(item))
        : []
      const nextGroups = Array.isArray(payload?.groups)
        ? (payload.groups as unknown[])
            .map((item) => normalizeGroup(item))
            .filter((item): item is CategoryGroup => Boolean(item))
        : []
      const nextUngrouped = Array.isArray(payload?.ungrouped)
        ? (payload.ungrouped as unknown[])
            .map((item) => normalizeRow(item))
            .filter((item): item is CategoryRow => Boolean(item))
        : []

      setRows(nextRows)
      setGroups(nextGroups)
      setUngrouped(nextUngrouped)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load categories'
      )
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

  const stats = useMemo(() => {
    const totalCategories = rows.length
    const activeCategories = rows.filter((r) => r.status === 'active').length
    const totalMapped = rows.reduce((sum, r) => sum + r.mappedCount, 0)
    const groupCount = visibleGroups.length
    return { totalCategories, activeCategories, totalMapped, groupCount }
  }, [rows, visibleGroups])

  const availableMoveTargets = useMemo(() => {
    if (!movingCategory) return []
    return visibleGroups.filter(
      (group) => group.id !== movingCategory.effective_group_id
    )
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
      .filter(
        (row) =>
          !normalizedSearch || row.name.toLowerCase().includes(normalizedSearch)
      )
      .map((row) => ({
        row,
        compatible: domain === 'receipt' || row.type === mergeRow.type,
      }))
  }, [domain, mergeRow, mergeSearch, rows])

  const receiptTypeOptions = useMemo(() => {
    const dynamic = rows
      .map((row) => row.type?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))

    return Array.from(new Set([...dynamic, ...RECEIPT_TYPE_FALLBACK])).map(
      (value) => ({
        value,
        label: formatTypeLabel(value),
      })
    )
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
    setCategoryType(
      domain === 'payment' ? (group?.payment_subtype ?? paymentSubtype) : 'custom'
    )
    setCategoryGroupId(group ? String(group.id) : '')
    setCategorySheetOpen(true)
  }

  function openEditCategory(row: CategoryRow) {
    setEditingCategory(row)
    setCategoryName(row.name)
    setCategoryType(row.type || (domain === 'payment' ? 'expense' : 'custom'))
    setCategoryGroupId(
      row.effective_group_id != null ? String(row.effective_group_id) : ''
    )
    setCategorySheetOpen(true)
  }

  async function openView(row: CategoryRow) {
    setViewDetails({ ...row, description: null })
    setViewOpen(true)
    setViewLoading(true)
    try {
      const response = await fetch(`/api/categories/${domain}/${row.id}`, {
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to load category details')
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
      toast.error(
        error instanceof Error ? error.message : 'Failed to load category details'
      )
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
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to save group')
      toast.success(editingGroup ? 'Group updated' : 'Group created')
      setGroupDialogOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save group'
      )
    } finally {
      setGroupSaving(false)
    }
  }

  async function toggleArchiveGroup(group: CategoryGroup) {
    try {
      const response = await fetch(
        `/api/category-groups/${domain}/${group.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_archived: !group.is_archived }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to update group')
      toast.success(group.is_archived ? 'Group restored' : 'Group archived')
      await loadCategories()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update group'
      )
    }
  }

  async function moveGroup(group: CategoryGroup, direction: 'up' | 'down') {
    const peerGroups = visibleGroups
      .filter((item) =>
        domain === 'payment'
          ? item.payment_subtype === group.payment_subtype
          : true
      )
      .sort((left, right) => left.sort_order - right.sort_order)
    const index = peerGroups.findIndex((item) => item.id === group.id)
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || targetIndex < 0 || targetIndex >= peerGroups.length) return

    const reordered = [...peerGroups]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(targetIndex, 0, moved)

    try {
      const response = await fetch(
        `/api/category-groups/${domain}/reorder`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupIds: reordered.map((item) => item.id) }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to reorder groups')
      await loadCategories()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to reorder groups'
      )
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
        editingCategory
          ? `/api/categories/${domain}/${editingCategory.id}`
          : '/api/categories',
        {
          method: editingCategory ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain,
            name,
            type: categoryType || null,
            effective_group_id: categoryGroupId ? Number(categoryGroupId) : null,
            groupId: categoryGroupId ? Number(categoryGroupId) : null,
            groupName:
              visibleGroups.find((group) => String(group.id) === categoryGroupId)
                ?.name ?? null,
          }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to save category')
      toast.success(editingCategory ? 'Category updated' : 'Category created')
      setCategorySheetOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save category'
      )
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
      const response = await fetch(
        `/api/category-groups/${domain}/memberships`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetGroupId: Number(moveTargetGroupId),
            categoryIds: [movingCategory.id],
          }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to move category')
      toast.success('Category moved')
      setMoveDialogOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to move category'
      )
    }
  }

  async function runMerge() {
    if (!mergeRow || !mergeTargetId) {
      toast.error('Select a target category')
      return
    }

    setMergeSaving(true)
    try {
      const response = await fetch(
        `/api/categories/${domain}/${mergeRow.id}/merge`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: mergeTargetId }),
        }
      )
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
      const response = await fetch(`/api/categories/${domain}/${row.id}`, {
        method: 'DELETE',
      })
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
      const suffix = deleteTargetGroupId
        ? `?targetGroupId=${deleteTargetGroupId}`
        : ''
      const response = await fetch(
        `/api/category-groups/${domain}/${deletingGroup.id}${suffix}`,
        { method: 'DELETE' }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to delete group')
      toast.success('Group deleted')
      setDeleteGroupOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete group'
      )
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Organize and manage your transaction categories
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              openCreateGroup(domain === 'payment' ? paymentSubtype : undefined)
            }
          >
            <FolderPlus className="mr-2 size-4" />
            New Group
          </Button>
          <Button onClick={() => openCreateCategory()}>
            <Plus className="mr-2 size-4" />
            New Category
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Categories"
          value={stats.totalCategories}
          subvalue={`${stats.activeCategories} active`}
        />
        <StatsCard
          label="Groups"
          value={stats.groupCount}
          subvalue={`Organizing ${stats.totalCategories} categories`}
        />
        <StatsCard
          label="Transactions Mapped"
          value={stats.totalMapped.toLocaleString()}
          subvalue="Across all categories"
          trend="up"
        />
        <StatsCard
          label="Domain"
          value={domain === 'payment' ? 'Payments' : 'Receipts'}
          subvalue={
            domain === 'payment'
              ? PAYMENT_TYPE_LABELS[paymentSubtype]
              : 'All types'
          }
        />
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Domain Tabs */}
          <Tabs
            value={domain}
            onValueChange={(value) => setDomain(value as Domain)}
          >
            <TabsList>
              <TabsTrigger value="payment">Payments</TabsTrigger>
              <TabsTrigger value="receipt">Receipts</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Payment Subtype Tabs */}
          {domain === 'payment' && (
            <Tabs
              value={paymentSubtype}
              onValueChange={(value) =>
                setPaymentSubtype(value as PaymentSubtype)
              }
            >
              <TabsList>
                {PAYMENT_TYPE_ORDER.map((type) => (
                  <TabsTrigger
                    key={type}
                    value={type}
                    className={cn(
                      'data-[state=active]:',
                      type === 'expense' && 'data-[state=active]:bg-expense/10',
                      type === 'income' && 'data-[state=active]:bg-income/10',
                      type === 'transfer' && 'data-[state=active]:bg-transfer/10'
                    )}
                  >
                    {PAYMENT_TYPE_LABELS[type]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search categories..."
                className="w-[200px] pl-9 lg:w-[280px]"
              />
              {searchInput && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 size-6 -translate-y-1/2"
                  onClick={() => setSearchInput('')}
                >
                  <X className="size-3" />
                </Button>
              )}
            </div>

            {/* Filter Toggle */}
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="size-4" />
            </Button>

            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border p-1">
              <Button
                size="icon"
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                className="size-7"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="size-4" />
              </Button>
              <Button
                size="icon"
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                className="size-7"
                onClick={() => setViewMode('list')}
              >
                <LayoutList className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Select
              value={period}
              onValueChange={(value: DatePeriod) => setPeriod(value)}
            >
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DATE_PERIOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={status}
              onValueChange={(value: 'all' | 'active' | 'inactive') =>
                setStatus(value)
              }
            >
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPeriod('all_history')
                setStatus('all')
                setSearchInput('')
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-dashed py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">
              Loading categories...
            </p>
          </div>
        </div>
      )}

      {/* Groups List */}
      {!loading && (
        <div className="space-y-4">
          {visibleGroups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              domain={domain}
              viewMode={viewMode}
              onCreateCategory={() => openCreateCategory(group)}
              onEditGroup={() => openEditGroup(group)}
              onArchiveGroup={() => void toggleArchiveGroup(group)}
              onMoveGroup={(direction) => void moveGroup(group, direction)}
              onDeleteGroup={() => {
                setDeletingGroup(group)
                setDeleteTargetGroupId('')
                setDeleteGroupOpen(true)
              }}
              onViewCategory={(category) => void openView(category)}
              onEditCategory={(category) => openEditCategory(category)}
              onMoveCategory={(category) => {
                setMovingCategory(category)
                setMoveTargetGroupId('')
                setMoveDialogOpen(true)
              }}
              onMergeCategory={(category) => {
                setMergeRow(category)
                setMergeSearch('')
                setMergeTargetId('')
                setMergeOpen(true)
              }}
              onDeleteCategory={(category) => void runDeleteCategory(category)}
            />
          ))}

          {visibleGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <FolderPlus className="size-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No groups found</p>
                <p className="text-sm text-muted-foreground">
                  Create a group to organize your categories
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  openCreateGroup(
                    domain === 'payment' ? paymentSubtype : undefined
                  )
                }
              >
                <FolderPlus className="mr-2 size-4" />
                Create Group
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Ungrouped Categories */}
      {!loading && ungrouped.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Ungrouped</h2>
            <p className="text-sm text-muted-foreground">
              Categories without a group assignment
            </p>
          </div>
          <div
            className={cn(
              'rounded-xl border bg-card p-4',
              viewMode === 'grid'
                ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'space-y-2'
            )}
          >
            {ungrouped.map((category) => (
              <CategoryCard
                key={String(category.id)}
                category={category}
                domain={domain}
                viewMode={viewMode}
                onView={() => void openView(category)}
                onEdit={() => openEditCategory(category)}
                onMove={() => {
                  setMovingCategory(category)
                  setMoveTargetGroupId('')
                  setMoveDialogOpen(true)
                }}
                onMerge={() => {
                  setMergeRow(category)
                  setMergeSearch('')
                  setMergeTargetId('')
                  setMergeOpen(true)
                }}
                onDelete={() => void runDeleteCategory(category)}
              />
            ))}
          </div>
        </div>
      )}

      {/* View Category Sheet */}
      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Category Details</SheetTitle>
            <SheetDescription>
              View category information and usage statistics
            </SheetDescription>
          </SheetHeader>
          {!viewDetails || viewLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="flex items-center gap-4">
                <div
                  className="flex size-16 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: viewDetails.color_hex
                      ? `${viewDetails.color_hex}15`
                      : 'var(--muted)',
                  }}
                >
                  <CategoryIcon
                    icon_key={viewDetails.icon_key}
                    className="size-8"
                    style={{ color: viewDetails.color_hex || undefined }}
                  />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">{viewDetails.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {viewDetails.type || 'No type'}
                  </p>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="flex justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge
                    variant={
                      viewDetails.status === 'active' ? 'default' : 'outline'
                    }
                  >
                    {viewDetails.status}
                  </Badge>
                </div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Group</span>
                  <span className="text-sm font-medium">
                    {viewDetails.effective_group_name || 'None'}
                  </span>
                </div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">
                    Transactions
                  </span>
                  <span className="text-sm font-medium">
                    {viewDetails.mappedCount}
                  </span>
                </div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">
                    {viewDetails.created_at
                      ? formatDate(viewDetails.created_at)
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between rounded-lg bg-muted/50 p-3">
                  <span className="text-sm text-muted-foreground">Updated</span>
                  <span className="text-sm font-medium">
                    {viewDetails.updated_at
                      ? formatDate(viewDetails.updated_at)
                      : '-'}
                  </span>
                </div>
                {viewDetails.description && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="text-sm text-muted-foreground">
                      Description
                    </span>
                    <p className="mt-1 text-sm">{viewDetails.description}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setViewOpen(false)
                    openEditCategory(viewDetails)
                  }}
                >
                  <Pencil className="mr-2 size-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setViewOpen(false)
                    setMovingCategory(viewDetails)
                    setMoveTargetGroupId('')
                    setMoveDialogOpen(true)
                  }}
                >
                  Move
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create/Edit Category Sheet */}
      <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </SheetTitle>
            <SheetDescription>
              {editingCategory
                ? 'Update category details'
                : 'Create a new category to organize your transactions'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="Enter category name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={categoryType} onValueChange={setCategoryType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {(domain === 'payment'
                    ? PAYMENT_TYPE_ORDER.map((value) => ({
                        value,
                        label: PAYMENT_TYPE_LABELS[value],
                      }))
                    : receiptTypeOptions
                  ).map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Group</label>
              <Select value={categoryGroupId} onValueChange={setCategoryGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
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
          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setCategorySheetOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveCategory()} disabled={categorySaving}>
              {categorySaving ? 'Saving...' : 'Save'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Group Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? 'Edit Group' : 'Create Group'}
            </DialogTitle>
            <DialogDescription>
              Groups help organize categories within the current domain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Enter group name"
              />
            </div>
            {domain === 'payment' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={groupSubtype}
                  onValueChange={(value: PaymentSubtype) =>
                    setGroupSubtype(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPE_ORDER.map((option) => (
                      <SelectItem key={option} value={option}>
                        {PAYMENT_TYPE_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveGroup()} disabled={groupSaving}>
              {groupSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Category Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Category</DialogTitle>
            <DialogDescription>
              Select a destination group for &quot;{movingCategory?.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={moveTargetGroupId}
              onValueChange={setMoveTargetGroupId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select group" />
              </SelectTrigger>
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
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveMoveCategory()}
              disabled={!moveTargetGroupId}
            >
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Group Dialog */}
      <Dialog open={deleteGroupOpen} onOpenChange={setDeleteGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Group</DialogTitle>
            <DialogDescription>
              {deletingGroup?.category_count
                ? 'This group contains categories. Select where to move them before deletion.'
                : 'Are you sure you want to delete this empty group?'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{deletingGroup?.name ?? '-'}</p>
            {Boolean(deletingGroup?.category_count) && (
              <Select
                value={deleteTargetGroupId}
                onValueChange={setDeleteTargetGroupId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target group" />
                </SelectTrigger>
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
            <Button variant="outline" onClick={() => setDeleteGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void runDeleteGroup()}
              disabled={
                deleteGroupSaving ||
                (Boolean(deletingGroup?.category_count) && !deleteTargetGroupId)
              }
            >
              {deleteGroupSaving ? 'Deleting...' : 'Delete Group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Category Dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Category</DialogTitle>
            <DialogDescription>
              Merge &quot;{mergeRow?.name}&quot; into another category
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={mergeSearch}
              onChange={(event) => setMergeSearch(event.target.value)}
              placeholder="Search target category..."
            />
            <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2">
              {mergeTargets.length === 0 && (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  No matching categories found
                </p>
              )}
              {mergeTargets.map(({ row, compatible }) => {
                const selected = mergeTargetId === String(row.id)
                return (
                  <button
                    key={String(row.id)}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      selected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted',
                      !compatible && 'cursor-not-allowed opacity-50'
                    )}
                    disabled={!compatible}
                    onClick={() => setMergeTargetId(String(row.id))}
                  >
                    <span className="flex items-center gap-2">
                      <CategoryColorDot
                        color_token={row.color_token}
                        color_hex={row.color_hex}
                        className="size-2"
                      />
                      <CategoryIcon icon_key={row.icon_key} className="size-4" />
                      <span className="font-medium">{row.name}</span>
                      {row.effective_group_name && (
                        <span className="text-xs text-muted-foreground">
                          in {row.effective_group_name}
                        </span>
                      )}
                    </span>
                    {!compatible ? (
                      <span className="text-xs text-muted-foreground">
                        Incompatible
                      </span>
                    ) : selected ? (
                      <Check className="size-4" />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void runMerge()}
              disabled={mergeSaving || !mergeTargetId}
            >
              {mergeSaving ? 'Merging...' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
