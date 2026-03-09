'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { CategoryColorDot } from '@/components/category-color-dot'
import { CategoryIcon } from '@/components/category-icon'
import { DATE_PERIOD_LABELS, type DatePeriod } from '@/lib/date-periods'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'

type Domain = 'receipt' | 'payment'

type CategoryRow = {
  id: string | number
  name: string
  type: string | null
  status: 'active' | 'inactive'
  mappedCount: number
  icon_key: string | null
  color_token: string | null
  color_hex: string | null
  created_at: string | null
  updated_at: string | null
}

type CategoryDetails = CategoryRow & {
  description?: string | null
}

const ICON_OPTIONS = [
  'tag',
  'salary',
  'income',
  'transfer',
  'groceries',
  'food',
  'transport',
  'home',
  'utilities',
  'healthcare',
  'education',
  'entertainment',
  'cash',
]

const COLOR_TOKEN_OPTIONS = [
  'slate',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'primary',
  'secondary',
  'muted-foreground',
  'destructive',
]

const PAYMENT_TYPE_ORDER = ['income', 'expense', 'transfer'] as const
const PAYMENT_TYPE_LABELS: Record<(typeof PAYMENT_TYPE_ORDER)[number], string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
}

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
    mappedCount: typeof row.mappedCount === 'number' ? row.mappedCount : 0,
    icon_key: asNullableText(row.icon_key),
    color_token: asNullableText(row.color_token),
    color_hex: asNullableText(row.color_hex),
    created_at: asNullableText(row.created_at),
    updated_at: asNullableText(row.updated_at),
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

export default function CategoriesPage() {
  const [domain, setDomain] = useState<Domain>('payment')
  const [paymentSubtype, setPaymentSubtype] = useState<'all' | 'expense' | 'transfer' | 'income'>('all')
  const [period, setPeriod] = useState<DatePeriod>('all_history')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'type' | 'sort_order'>('name')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(false)

  const [viewDetails, setViewDetails] = useState<CategoryDetails | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [viewLoading, setViewLoading] = useState(false)

  const [editRow, setEditRow] = useState<CategoryRow | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editName, setEditName] = useState('')
  const [editIconKey, setEditIconKey] = useState<string>('auto')
  const [editColorToken, setEditColorToken] = useState<string>('auto')
  const [editColorHex, setEditColorHex] = useState('')

  const [mergeRow, setMergeRow] = useState<CategoryRow | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSaving, setMergeSaving] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState<string>('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
    }, 300)

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
        sortBy,
        search,
      })

      const response = await fetch(`/api/categories?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load categories')
      }

      const normalized = Array.isArray(payload?.categories)
        ? (payload.categories as unknown[]).map((item) => normalizeRow(item)).filter((row): row is CategoryRow => Boolean(row))
        : []
      setRows(normalized)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCategories()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, paymentSubtype, period, status, sortBy, search])

  const groupedRows = useMemo(() => {
    if (domain !== 'payment' || paymentSubtype !== 'all') return null

    return PAYMENT_TYPE_ORDER.map((type) => ({
      type,
      label: PAYMENT_TYPE_LABELS[type],
      rows: rows.filter((row) => row.type === type),
    }))
  }, [domain, paymentSubtype, rows])

  const mergeTargets = useMemo(() => {
    if (!mergeRow) return []
    const normalizedSearch = mergeSearch.trim().toLowerCase()

    return rows
      .filter((row) => String(row.id) !== String(mergeRow.id))
      .filter((row) => {
        if (!normalizedSearch) return true
        return row.name.toLowerCase().includes(normalizedSearch)
      })
      .map((row) => {
        const compatible = domain === 'receipt' || row.type === mergeRow.type
        return { row, compatible }
      })
  }, [domain, mergeRow, mergeSearch, rows])

  async function openView(row: CategoryRow) {
    setViewDetails({
      ...row,
      description: null,
    })
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
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load category details')
    } finally {
      setViewLoading(false)
    }
  }

  function openEdit(row: CategoryRow) {
    setEditRow(row)
    setEditName(row.name)
    setEditIconKey(row.icon_key || 'auto')
    setEditColorToken(row.color_token || 'auto')
    setEditColorHex(row.color_hex || '')
    setEditOpen(true)
  }

  function openMerge(row: CategoryRow) {
    setMergeRow(row)
    setMergeSearch('')
    setMergeTargetId('')
    setMergeOpen(true)
  }

  async function saveEdit() {
    if (!editRow) return
    const name = editName.trim()
    if (!name) {
      toast.error('Category name is required')
      return
    }

    setEditSaving(true)
    try {
      const response = await fetch(`/api/categories/${domain}/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          icon_key: editIconKey === 'auto' ? null : editIconKey,
          color_token: editColorToken === 'auto' ? null : editColorToken,
          color_hex: editColorHex.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to update category')

      toast.success('Category updated')
      setEditOpen(false)
      await loadCategories()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update category')
    } finally {
      setEditSaving(false)
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

  async function runDelete(row: CategoryRow) {
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

  function renderRow(row: CategoryRow) {
    return (
      <tr key={String(row.id)} className="border-b align-top">
        <td className="p-2">
          <span className="text-xs text-muted-foreground">{row.id}</span>
        </td>
        <td className="p-2">
          <div className="flex items-center gap-2">
            <CategoryColorDot color_token={row.color_token} color_hex={row.color_hex} className="size-2.5" />
            <CategoryIcon icon_key={row.icon_key} className="size-4" />
            <span className="font-medium">{row.name}</span>
          </div>
        </td>
        <td className="p-2">{row.type || '-'}</td>
        <td className="p-2">
          <Badge variant={row.status === 'active' ? 'default' : 'outline'}>
            {row.status}
          </Badge>
        </td>
        <td className="p-2 text-right tabular-nums">{row.mappedCount}</td>
        <td className="p-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void openView(row)}>View</Button>
            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button>
            <Button size="sm" variant="outline" onClick={() => openMerge(row)}>Merge</Button>
            <Button size="sm" variant="destructive" onClick={() => void runDelete(row)}>Delete</Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Category Management</h1>
        <p className="text-sm text-muted-foreground">
          Manage category names, styling, and merges with period-based mapped counts.
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
          <Select value={paymentSubtype} onValueChange={(value: 'all' | 'expense' | 'transfer' | 'income') => setPaymentSubtype(value)}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
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

        <Select value={sortBy} onValueChange={(value: 'name' | 'created_at' | 'type' | 'sort_order') => setSortBy(value)}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="type">Type</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
            <SelectItem value="sort_order">Sort order</SelectItem>
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
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="p-2 font-medium">ID</th>
              <th className="p-2 font-medium">Name</th>
              <th className="p-2 font-medium">Type</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium text-right">Mapped Count</th>
              <th className="p-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>Loading categories...</td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td className="p-4 text-center text-muted-foreground" colSpan={6}>No categories found</td>
              </tr>
            )}

            {!loading && groupedRows && groupedRows.map((group) => (
              <FragmentGroup
                key={group.type}
                label={group.label}
                rows={group.rows}
                renderRow={renderRow}
              />
            ))}

            {!loading && !groupedRows && rows.map(renderRow)}
          </tbody>
        </table>
      </div>

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
              <div><span className="text-muted-foreground">Status:</span> {viewDetails.status}</div>
              <div><span className="text-muted-foreground">Mapped transactions/receipts:</span> {viewDetails.mappedCount}</div>
              <div><span className="text-muted-foreground">Created:</span> {viewDetails.created_at ? formatDate(viewDetails.created_at) : '-'}</div>
              <div><span className="text-muted-foreground">Updated:</span> {viewDetails.updated_at ? formatDate(viewDetails.updated_at) : '-'}</div>
              <div><span className="text-muted-foreground">Description:</span> {viewDetails.description || '-'}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update category name and style. Leave icon/color as Auto to use name-based matching.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Name</label>
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>

            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Icon</label>
              <Select value={editIconKey} onValueChange={setEditIconKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto match</SelectItem>
                  {ICON_OPTIONS.map((iconKey) => (
                    <SelectItem key={iconKey} value={iconKey}>{iconKey}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Color token</label>
              <Select value={editColorToken} onValueChange={setEditColorToken}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto match</SelectItem>
                  {COLOR_TOKEN_OPTIONS.map((token) => (
                    <SelectItem key={token} value={token}>{token}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm text-muted-foreground">Optional custom hex</label>
              <Input
                value={editColorHex}
                onChange={(event) => setEditColorHex(event.target.value)}
                placeholder="#10b981"
              />
            </div>

            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs text-muted-foreground">Preview</p>
              <div className="flex items-center gap-2 text-sm">
                <CategoryColorDot
                  color_token={editColorToken === 'auto' ? null : editColorToken}
                  color_hex={editColorHex.trim() || null}
                  className="size-2.5"
                />
                <CategoryIcon icon_key={editIconKey === 'auto' ? null : editIconKey} name={editName} className="size-4" />
                <span className="font-medium">{editName || 'Category name'}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveEdit()} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Category</DialogTitle>
            <DialogDescription>
              Pick a target category by name. Existing mappings from source will move to target.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Source category</p>
              <p className="text-sm font-medium">{mergeRow?.name ?? '-'}</p>
            </div>

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

function FragmentGroup(props: {
  label: string
  rows: CategoryRow[]
  renderRow: (row: CategoryRow) => ReactNode
}) {
  if (props.rows.length === 0) return null

  return (
    <>
      <tr className="border-y bg-muted/40">
        <td colSpan={6} className="p-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {props.label}
        </td>
      </tr>
      {props.rows.map(props.renderRow)}
    </>
  )
}
