'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  Filter,
  Grid3X3,
  LayoutList,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
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
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { CategoryIcon } from '@/components/category-icon'
import { CategoryColorDot } from '@/components/category-color-dot'
import { TAG_COLOR_OPTIONS, TAG_ICON_OPTIONS } from '@/lib/tags/options'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface TagRow extends TagPresentation {
  id: string
  normalized_name: string
  description: string | null
  source: 'default' | 'member' | 'custom' | 'system'
  is_active: boolean
  created_at: string
  updated_at: string
  statement_mapped_count: number
  receipt_mapped_count: number
  total_mapped_count: number
}

function emptyDraft() {
  return {
    name: '',
    color_token: 'slate',
    color_hex: '',
    icon_key: 'tag',
    description: '',
  }
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

// Tag Card Component for Grid View
function TagCard({
  tag,
  maxMapped,
  onEdit,
  onMerge,
  onDelete,
}: {
  tag: TagRow
  maxMapped: number
  onEdit: () => void
  onMerge: () => void
  onDelete: () => void
}) {
  const usagePercent = maxMapped > 0 ? (tag.total_mapped_count / maxMapped) * 100 : 0

  const sourceColors: Record<string, string> = {
    default: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    member: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    custom: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
    system: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
  }

  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-all hover:border-primary/20 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div
          className="flex size-12 items-center justify-center rounded-xl"
          style={{
            backgroundColor: tag.color_hex
              ? `${tag.color_hex}15`
              : 'var(--muted)',
          }}
        >
          <CategoryIcon
            icon_key={tag.icon_key}
            className="size-6"
            style={{ color: tag.color_hex || undefined }}
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
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMerge}>Merge with Another</DropdownMenuItem>
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
        <h4 className="font-medium leading-tight">{tag.name}</h4>
        {tag.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {tag.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className={cn('text-[10px] capitalize', sourceColors[tag.source])}
        >
          {tag.source}
        </Badge>
        {!tag.is_active && (
          <Badge variant="outline" className="text-[10px]">
            Inactive
          </Badge>
        )}
      </div>

      <div className="mt-auto space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Usage</span>
          <span className="font-medium">{tag.total_mapped_count} items</span>
        </div>
        <Progress value={usagePercent} className="h-1.5" />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{tag.statement_mapped_count} statements</span>
          <span>{tag.receipt_mapped_count} receipts</span>
        </div>
      </div>
    </div>
  )
}

// Tag List Item for List View
function TagListItem({
  tag,
  maxMapped,
  onEdit,
  onMerge,
  onDelete,
}: {
  tag: TagRow
  maxMapped: number
  onEdit: () => void
  onMerge: () => void
  onDelete: () => void
}) {
  const usagePercent = maxMapped > 0 ? (tag.total_mapped_count / maxMapped) * 100 : 0

  const sourceColors: Record<string, string> = {
    default: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
    member: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    custom: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
    system: 'bg-gray-50 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
  }

  return (
    <div className="group flex items-center gap-4 rounded-lg border bg-card px-4 py-3 transition-all hover:border-primary/20 hover:shadow-sm">
      <div
        className="flex size-10 shrink-0 items-center justify-center rounded-lg"
        style={{
          backgroundColor: tag.color_hex
            ? `${tag.color_hex}15`
            : 'var(--muted)',
        }}
      >
        <CategoryIcon
          icon_key={tag.icon_key}
          className="size-5"
          style={{ color: tag.color_hex || undefined }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{tag.name}</span>
          <Badge
            variant="outline"
            className={cn('text-[10px] capitalize', sourceColors[tag.source])}
          >
            {tag.source}
          </Badge>
        </div>
        {tag.description && (
          <p className="truncate text-xs text-muted-foreground">
            {tag.description}
          </p>
        )}
      </div>

      <div className="hidden w-32 flex-col gap-1 sm:flex">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Usage</span>
          <span className="font-medium">{tag.total_mapped_count}</span>
        </div>
        <Progress value={usagePercent} className="h-1.5" />
      </div>

      <div className="hidden text-right text-xs text-muted-foreground md:block">
        {formatDate(tag.created_at)}
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onMerge}>Merge with Another</DropdownMenuItem>
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

// Tag Cloud View
function TagCloudView({
  tags,
  maxMapped,
  onTagClick,
}: {
  tags: TagRow[]
  maxMapped: number
  onTagClick: (tag: TagRow) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-6">
      {tags.map((tag) => {
        const sizeClass =
          tag.total_mapped_count > maxMapped * 0.7
            ? 'text-lg'
            : tag.total_mapped_count > maxMapped * 0.4
              ? 'text-base'
              : tag.total_mapped_count > maxMapped * 0.1
                ? 'text-sm'
                : 'text-xs'

        return (
          <button
            key={tag.id}
            onClick={() => onTagClick(tag)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all hover:border-primary/30 hover:shadow-sm',
              sizeClass
            )}
            style={{
              backgroundColor: tag.color_hex
                ? `${tag.color_hex}08`
                : undefined,
              borderColor: tag.color_hex ? `${tag.color_hex}30` : undefined,
            }}
          >
            <CategoryColorDot
              color_token={tag.color_token}
              color_hex={tag.color_hex}
              className="size-2"
            />
            <CategoryIcon
              icon_key={tag.icon_key ?? 'tag'}
              className="size-3.5"
              style={{ color: tag.color_hex || undefined }}
            />
            <span>{tag.name}</span>
            <span className="ml-1 text-muted-foreground">
              ({tag.total_mapped_count})
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function TagsPage() {
  const [rows, setRows] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<
    'all' | 'default' | 'member' | 'custom' | 'system'
  >('all')
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'usage_count'>(
    'name'
  )
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'cloud'>('grid')
  const [showFilters, setShowFilters] = useState(false)

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [draft, setDraft] = useState(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [mergeSaving, setMergeSaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  const loadTags = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search,
        source,
        status: 'active',
        sortBy,
        sortDir,
      })
      const response = await fetch(`/api/tags?${params.toString()}`, {
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to load tags')
      setRows(Array.isArray(payload?.tags) ? payload.tags : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load tags')
    } finally {
      setLoading(false)
    }
  }, [search, source, sortBy, sortDir])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  const stats = useMemo(() => {
    const totalTags = rows.length
    const activeTags = rows.filter((r) => r.is_active).length
    const totalMapped = rows.reduce((sum, r) => sum + r.total_mapped_count, 0)
    const maxMapped = Math.max(...rows.map((r) => r.total_mapped_count), 1)
    const customTags = rows.filter((r) => r.source === 'custom').length
    return { totalTags, activeTags, totalMapped, maxMapped, customTags }
  }, [rows])

  const mergeTargets = useMemo(() => {
    if (!editingTag) return []
    const normalizedSearch = mergeSearch.trim().toLowerCase()
    return rows
      .filter((row) => row.id !== editingTag.id)
      .filter((row) => row.is_active)
      .filter(
        (row) =>
          !normalizedSearch || row.name.toLowerCase().includes(normalizedSearch)
      )
  }, [editingTag, mergeSearch, rows])

  function openCreate() {
    setEditingTag(null)
    setDraft(emptyDraft())
    setEditorOpen(true)
  }

  function openEdit(tag: TagRow) {
    setEditingTag(tag)
    setDraft({
      name: tag.name,
      color_token: tag.color_token ?? 'slate',
      color_hex: tag.color_hex ?? '',
      icon_key: tag.icon_key ?? 'tag',
      description: tag.description ?? '',
    })
    setEditorOpen(true)
  }

  async function saveTag() {
    if (!draft.name.trim()) {
      toast.error('Tag name is required')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(
        editingTag ? `/api/tags/${editingTag.id}` : '/api/tags',
        {
          method: editingTag ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name,
            color_token: draft.color_token,
            color_hex: draft.color_hex.trim() || null,
            icon_key: draft.icon_key,
            description: draft.description.trim() || null,
          }),
        }
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to save tag')
      toast.success(editingTag ? 'Tag updated' : 'Tag created')
      setEditorOpen(false)
      await loadTags()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save tag')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTag(tag: TagRow) {
    const confirmed = confirm(
      `Delete tag "${tag.name}"? Existing mappings will be detached.`
    )
    if (!confirmed) return
    try {
      const response = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to delete tag')
      toast.success('Tag deleted')
      await loadTags()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete tag'
      )
    }
  }

  async function runMerge() {
    if (!editingTag || !mergeTargetId) {
      toast.error('Choose a target tag')
      return
    }
    setMergeSaving(true)
    try {
      const response = await fetch(`/api/tags/${editingTag.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: mergeTargetId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(payload?.error || 'Failed to merge tag')
      toast.success('Tag merged')
      setMergeOpen(false)
      await loadTags()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to merge tag'
      )
    } finally {
      setMergeSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">
            Organize transactions with custom labels
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          New Tag
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Tags"
          value={stats.totalTags}
          subvalue={`${stats.activeTags} active`}
          icon={Tag}
        />
        <StatsCard
          label="Custom Tags"
          value={stats.customTags}
          subvalue="Created by you"
          icon={Sparkles}
        />
        <StatsCard
          label="Items Tagged"
          value={stats.totalMapped.toLocaleString()}
          subvalue="Statements & receipts"
          icon={Cloud}
          trend="up"
        />
        <StatsCard
          label="Most Used"
          value={stats.maxMapped}
          subvalue="transactions"
          icon={TrendingUp}
        />
      </div>

      {/* Filters and Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search tags..."
              className="pl-9"
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

          <div className="ml-auto flex items-center gap-2">
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
                title="Grid view"
              >
                <Grid3X3 className="size-4" />
              </Button>
              <Button
                size="icon"
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                className="size-7"
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <LayoutList className="size-4" />
              </Button>
              <Button
                size="icon"
                variant={viewMode === 'cloud' ? 'secondary' : 'ghost'}
                className="size-7"
                onClick={() => setViewMode('cloud')}
                title="Cloud view"
              >
                <Cloud className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Select
              value={source}
              onValueChange={(value) =>
                setSource(value as typeof source)
              }
            >
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as typeof sortBy)}
            >
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="created_at">Created</SelectItem>
                <SelectItem value="usage_count">Usage</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
              }
              className="gap-2"
            >
              {sortDir === 'asc' ? (
                <ArrowUp className="size-3.5" />
              ) : (
                <ArrowDown className="size-3.5" />
              )}
              {sortDir === 'asc' ? 'Ascending' : 'Descending'}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSource('all')
                setSortBy('name')
                setSortDir('asc')
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
            <p className="text-sm text-muted-foreground">Loading tags...</p>
          </div>
        </div>
      )}

      {/* Tags Content */}
      {!loading && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-4">
            <Tag className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">No tags found</p>
            <p className="text-sm text-muted-foreground">
              Create a tag to start organizing your transactions
            </p>
          </div>
          <Button variant="outline" onClick={openCreate}>
            <Plus className="mr-2 size-4" />
            Create Tag
          </Button>
        </div>
      )}

      {!loading && rows.length > 0 && viewMode === 'grid' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((tag) => (
            <TagCard
              key={tag.id}
              tag={tag}
              maxMapped={stats.maxMapped}
              onEdit={() => openEdit(tag)}
              onMerge={() => {
                setEditingTag(tag)
                setMergeTargetId('')
                setMergeSearch('')
                setMergeOpen(true)
              }}
              onDelete={() => void deleteTag(tag)}
            />
          ))}
        </div>
      )}

      {!loading && rows.length > 0 && viewMode === 'list' && (
        <div className="space-y-2">
          {rows.map((tag) => (
            <TagListItem
              key={tag.id}
              tag={tag}
              maxMapped={stats.maxMapped}
              onEdit={() => openEdit(tag)}
              onMerge={() => {
                setEditingTag(tag)
                setMergeTargetId('')
                setMergeSearch('')
                setMergeOpen(true)
              }}
              onDelete={() => void deleteTag(tag)}
            />
          ))}
        </div>
      )}

      {!loading && rows.length > 0 && viewMode === 'cloud' && (
        <TagCloudView
          tags={rows}
          maxMapped={stats.maxMapped}
          onTagClick={(tag) => openEdit(tag)}
        />
      )}

      {/* Create/Edit Tag Sheet */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editingTag ? 'Edit Tag' : 'New Tag'}</SheetTitle>
            <SheetDescription>
              {editingTag
                ? 'Update tag appearance and details'
                : 'Create a custom tag to organize your transactions'}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Enter tag name"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Icon</label>
                <Select
                  value={draft.icon_key}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, icon_key: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose icon" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <CategoryIcon
                            icon_key={option.value}
                            className="size-4"
                          />
                          <span>{option.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Color</label>
                <Select
                  value={draft.color_token}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, color_token: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose color" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_COLOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <CategoryColorDot
                            color_token={option.value}
                            color_hex={null}
                            className="size-3"
                          />
                          <span>{option.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Custom Hex Color</label>
              <div className="flex gap-2">
                <Input
                  value={draft.color_hex}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      color_hex: event.target.value,
                    }))
                  }
                  placeholder="#0f766e"
                  className="flex-1"
                />
                {draft.color_hex && (
                  <div
                    className="size-10 rounded-lg border"
                    style={{ backgroundColor: draft.color_hex }}
                  />
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional description"
              />
            </div>

            {/* Preview */}
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Preview
              </p>
              <div className="flex items-center gap-4">
                <div
                  className="flex size-12 items-center justify-center rounded-xl"
                  style={{
                    backgroundColor: draft.color_hex
                      ? `${draft.color_hex}15`
                      : 'var(--muted)',
                  }}
                >
                  <CategoryIcon
                    icon_key={draft.icon_key}
                    className="size-6"
                    style={{ color: draft.color_hex || undefined }}
                  />
                </div>
                <div>
                  <p className="font-medium">
                    {draft.name || 'Tag preview'}
                  </p>
                  <TagBadge
                    name={draft.name || 'Tag preview'}
                    icon_key={draft.icon_key}
                    color_token={draft.color_token}
                    color_hex={draft.color_hex || null}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveTag()} disabled={saving}>
              {saving ? 'Saving...' : 'Save Tag'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Merge Tag Dialog */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
            <DialogDescription>
              Merge &quot;{editingTag?.name}&quot; into another tag. All mappings
              will be transferred.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={mergeSearch}
              onChange={(event) => setMergeSearch(event.target.value)}
              placeholder="Search target tag..."
            />
            <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2">
              {mergeTargets.length === 0 && (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  No matching tags found
                </p>
              )}
              {mergeTargets.map((row) => {
                const selected = mergeTargetId === row.id
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors',
                      selected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                    onClick={() => setMergeTargetId(row.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-8 items-center justify-center rounded-lg"
                        style={{
                          backgroundColor: row.color_hex
                            ? `${row.color_hex}15`
                            : 'var(--muted)',
                        }}
                      >
                        <CategoryIcon
                          icon_key={row.icon_key}
                          className="size-4"
                          style={{ color: row.color_hex || undefined }}
                        />
                      </div>
                      <div>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {row.total_mapped_count} items
                        </p>
                      </div>
                    </div>
                    {selected && <Check className="size-4" />}
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
              {mergeSaving ? 'Merging...' : 'Merge Tags'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
