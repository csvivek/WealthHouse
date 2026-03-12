'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Loader2, Search, Store, WandSparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MerchantColorDot } from '@/components/merchant-color-dot'
import { MerchantIcon } from '@/components/merchant-icon'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type MerchantRow = {
  id: string
  household_id: string | null
  name: string
  normalized_name: string | null
  icon_key: string
  color_token: string
  color_hex: string | null
  notes: string | null
  is_active: boolean
  merged_into_merchant_id: string | null
  created_at: string
  updated_at: string
  alias_count: number
  transaction_count: number
  receipt_count: number
  ledger_entry_count: number
  total_spend: number
}

type MerchantAliasRow = {
  id: string
  merchant_id: string
  raw_name: string | null
  normalized_raw_name: string | null
  source_type: string
  confidence: number | null
  created_at: string
  updated_at: string
}

type MerchantDetail = MerchantRow & {
  aliases: MerchantAliasRow[]
}

type MerchantImpactSummary = {
  aliases: number
  statementTransactions: number
  receipts: number
  ledgerEntries: number
  receiptKnowledge: number
  categorizationAudits: number
  groceryPurchases: number
  total: number
}

const ICON_OPTIONS = [
  { value: 'store', label: 'Store' },
  { value: 'coffee', label: 'Coffee' },
  { value: 'food', label: 'Food' },
  { value: 'cart', label: 'Cart' },
  { value: 'bag', label: 'Bag' },
  { value: 'transport', label: 'Transport' },
  { value: 'bank', label: 'Bank' },
  { value: 'health', label: 'Health' },
  { value: 'travel', label: 'Travel' },
  { value: 'company', label: 'Company' },
]

const COLOR_OPTIONS = ['slate', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5']

function asNullableText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function normalizeRow(value: unknown): MerchantRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.name !== 'string') return null

  return {
    id: row.id,
    household_id: asNullableText(row.household_id),
    name: row.name,
    normalized_name: asNullableText(row.normalized_name),
    icon_key: asNullableText(row.icon_key) ?? 'store',
    color_token: asNullableText(row.color_token) ?? 'slate',
    color_hex: asNullableText(row.color_hex),
    notes: asNullableText(row.notes),
    is_active: row.is_active !== false,
    merged_into_merchant_id: asNullableText(row.merged_into_merchant_id),
    created_at: asNullableText(row.created_at) ?? new Date().toISOString(),
    updated_at: asNullableText(row.updated_at) ?? new Date().toISOString(),
    alias_count: asNumber(row.alias_count),
    transaction_count: asNumber(row.transaction_count),
    receipt_count: asNumber(row.receipt_count),
    ledger_entry_count: asNumber(row.ledger_entry_count),
    total_spend: asNumber(row.total_spend),
  }
}

function normalizeAlias(value: unknown): MerchantAliasRow | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.merchant_id !== 'string') return null

  return {
    id: row.id,
    merchant_id: row.merchant_id,
    raw_name: asNullableText(row.raw_name),
    normalized_raw_name: asNullableText(row.normalized_raw_name),
    source_type: asNullableText(row.source_type) ?? 'manual',
    confidence: typeof row.confidence === 'number' ? row.confidence : null,
    created_at: asNullableText(row.created_at) ?? new Date().toISOString(),
    updated_at: asNullableText(row.updated_at) ?? new Date().toISOString(),
  }
}

function normalizeDetail(value: unknown): MerchantDetail | null {
  const row = normalizeRow(value)
  if (!row) return null
  const payload = value as Record<string, unknown>
  const aliases = Array.isArray(payload.aliases)
    ? payload.aliases.map((alias) => normalizeAlias(alias)).filter((alias: MerchantAliasRow | null): alias is MerchantAliasRow => Boolean(alias))
    : []

  return { ...row, aliases }
}

function normalizeImpact(value: unknown): MerchantImpactSummary {
  const payload = (value ?? {}) as Record<string, unknown>
  return {
    aliases: asNumber(payload.aliases),
    statementTransactions: asNumber(payload.statementTransactions),
    receipts: asNumber(payload.receipts),
    ledgerEntries: asNumber(payload.ledgerEntries),
    receiptKnowledge: asNumber(payload.receiptKnowledge),
    categorizationAudits: asNumber(payload.categorizationAudits),
    groceryPurchases: asNumber(payload.groceryPurchases),
    total: asNumber(payload.total),
  }
}

export default function MerchantsPage() {
  const [rows, setRows] = useState<MerchantRow[]>([])
  const [loading, setLoading] = useState(false)
  const [schemaMessage, setSchemaMessage] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active')
  const [sortBy, setSortBy] = useState<'name' | 'updated_at' | 'alias_count' | 'transaction_count' | 'receipt_count' | 'total_spend'>('updated_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [backfilling, setBackfilling] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detail, setDetail] = useState<MerchantDetail | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingMerchant, setEditingMerchant] = useState<MerchantRow | null>(null)
  const [merchantName, setMerchantName] = useState('')
  const [merchantNotes, setMerchantNotes] = useState('')
  const [merchantIcon, setMerchantIcon] = useState('auto')
  const [merchantColor, setMerchantColor] = useState('auto')
  const [merchantColorHex, setMerchantColorHex] = useState('')
  const [merchantAlias, setMerchantAlias] = useState('')
  const [merchantState, setMerchantState] = useState<'active' | 'inactive'>('active')

  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeSelectionIds, setMergeSelectionIds] = useState<string[]>([])
  const [survivorId, setSurvivorId] = useState<string>('')
  const [mergePreview, setMergePreview] = useState<MerchantImpactSummary | null>(null)
  const [mergePreviewLoading, setMergePreviewLoading] = useState(false)
  const [mergeSaving, setMergeSaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  async function loadMerchants() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search,
        status,
        sortBy,
        sortDir,
      })
      const response = await fetch(`/api/merchants?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to load merchants'
        if (response.status === 503) {
          setSchemaMessage(message)
          setRows([])
          setSelectedIds([])
          return
        }
        throw new Error(message)
      }

      const merchants = Array.isArray(payload?.merchants)
        ? payload.merchants.map((merchant: unknown) => normalizeRow(merchant)).filter((merchant: MerchantRow | null): merchant is MerchantRow => Boolean(merchant))
        : []

      setSchemaMessage(null)
      setRows(merchants)
      setSelectedIds((previous) => previous.filter((id) => merchants.some((merchant: MerchantRow) => merchant.id === id)))
    } catch (error) {
      setSchemaMessage(null)
      toast.error(error instanceof Error ? error.message : 'Failed to load merchants')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMerchants()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, sortBy, sortDir])

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds],
  )

  const mergeCandidates = useMemo(() => {
    const normalizedSearch = mergeSearch.trim().toLowerCase()
    return rows.filter((row) => {
      if (!normalizedSearch) return true
      return row.name.toLowerCase().includes(normalizedSearch) || (row.normalized_name ?? '').toLowerCase().includes(normalizedSearch)
    })
  }, [mergeSearch, rows])

  const victimIds = mergeSelectionIds.filter((id) => id !== survivorId)

  useEffect(() => {
    if (!mergeOpen) return
    if (mergeSelectionIds.length === 0) {
      setSurvivorId('')
      return
    }
    if (!mergeSelectionIds.includes(survivorId)) {
      setSurvivorId(mergeSelectionIds[0] ?? '')
    }
  }, [mergeOpen, mergeSelectionIds, survivorId])

  useEffect(() => {
    if (!mergeOpen || !survivorId || victimIds.length === 0) {
      setMergePreview(null)
      return
    }

    let cancelled = false
    async function loadPreview() {
      setMergePreviewLoading(true)
      try {
        const response = await fetch(`/api/merchants/${survivorId}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ victimIds, preview: true }),
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to preview merge'
          throw new Error(message)
        }
        if (!cancelled) {
          setMergePreview(normalizeImpact(payload?.preview?.impact))
        }
      } catch (error) {
        if (!cancelled) {
          setMergePreview(null)
          toast.error(error instanceof Error ? error.message : 'Failed to preview merge')
        }
      } finally {
        if (!cancelled) setMergePreviewLoading(false)
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [mergeOpen, survivorId, victimIds])

  function resetForm() {
    setEditingMerchant(null)
    setMerchantName('')
    setMerchantNotes('')
    setMerchantIcon('auto')
    setMerchantColor('auto')
    setMerchantColorHex('')
    setMerchantAlias('')
    setMerchantState('active')
  }

  function openCreateDialog() {
    resetForm()
    setFormOpen(true)
  }

  function openEditDialog(row: MerchantRow) {
    setEditingMerchant(row)
    setMerchantName(row.name)
    setMerchantNotes(row.notes ?? '')
    setMerchantIcon(row.icon_key || 'auto')
    setMerchantColor(row.color_token || 'auto')
    setMerchantColorHex(row.color_hex ?? '')
    setMerchantAlias('')
    setMerchantState(row.is_active ? 'active' : 'inactive')
    setFormOpen(true)
  }

  async function openDetail(row: MerchantRow) {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetail(null)
    try {
      const response = await fetch(`/api/merchants/${row.id}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to load merchant details'
        throw new Error(message)
      }
      setDetail(normalizeDetail(payload?.merchant))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load merchant details')
    } finally {
      setDetailLoading(false)
    }
  }

  function toggleSelection(merchantId: string, checked: boolean) {
    setSelectedIds((previous) => {
      if (checked) return Array.from(new Set([...previous, merchantId]))
      return previous.filter((id) => id !== merchantId)
    })
  }

  function toggleMergeSelection(merchantId: string, checked: boolean) {
    setMergeSelectionIds((previous) => {
      if (checked) return Array.from(new Set([...previous, merchantId]))
      return previous.filter((id) => id !== merchantId)
    })
  }

  function openMergeDialog(seedId?: string) {
    const initialSelection = Array.from(new Set(seedId ? [...selectedIds, seedId] : selectedIds))
    setMergeSelectionIds(initialSelection)
    setSurvivorId(initialSelection[0] ?? '')
    setMergeSearch('')
    setMergePreview(null)
    setMergeOpen(true)
  }

  async function saveMerchant() {
    const name = merchantName.trim()
    if (!name) {
      toast.error('Merchant name is required')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(
        editingMerchant ? `/api/merchants/${editingMerchant.id}` : '/api/merchants',
        {
          method: editingMerchant ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            notes: merchantNotes || null,
            icon_key: merchantIcon === 'auto' ? null : merchantIcon,
            color_token: merchantColor === 'auto' ? null : merchantColor,
            color_hex: merchantColorHex.trim() || null,
            alias: merchantAlias.trim() || null,
            is_active: merchantState === 'active',
          }),
        },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to save merchant'
        throw new Error(message)
      }

      toast.success(editingMerchant ? 'Merchant updated' : 'Merchant created')
      setFormOpen(false)
      resetForm()
      await loadMerchants()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save merchant')
    } finally {
      setSaving(false)
    }
  }

  async function runDelete(row: MerchantRow) {
    const confirmed = confirm(`Delete merchant "${row.name}"?`)
    if (!confirmed) return

    try {
      const response = await fetch(`/api/merchants/${row.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to delete merchant'
        throw new Error(message)
      }

      toast.success('Merchant deleted')
      await loadMerchants()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete merchant')
    }
  }

  async function runBackfill() {
    setBackfilling(true)
    try {
      const response = await fetch('/api/merchants/backfill', { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to backfill merchants'
        throw new Error(message)
      }

      const result = payload?.result
      toast.success(
        `Backfill completed. ${result?.updatedTransactions ?? 0} transactions, ${result?.updatedReceipts ?? 0} receipts, ${result?.updatedLedgerEntries ?? 0} ledger entries updated.`,
      )
      await loadMerchants()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to backfill merchants')
    } finally {
      setBackfilling(false)
    }
  }

  async function runMerge() {
    if (!survivorId || victimIds.length === 0) {
      toast.error('Select a survivor and at least one merchant to merge')
      return
    }

    setMergeSaving(true)
    try {
      const response = await fetch(`/api/merchants/${survivorId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ victimIds }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const message = payload?.action ? `${payload.error} ${payload.action}` : payload?.error || 'Failed to merge merchants'
        throw new Error(message)
      }

      toast.success('Merchants merged')
      setSelectedIds([])
      setMergeOpen(false)
      await loadMerchants()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to merge merchants')
    } finally {
      setMergeSaving(false)
    }
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Merchants</h1>
          <p className="text-muted-foreground">
            Clean up noisy merchant names into canonical merchants with reusable aliases, styling, and safe merge tools.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void runBackfill()} disabled={backfilling || Boolean(schemaMessage)}>
            {backfilling ? <Loader2 className="mr-2 size-4 animate-spin" /> : <WandSparkles className="mr-2 size-4" />}
            {backfilling ? 'Backfilling...' : 'Backfill Links'}
          </Button>
          <Button onClick={openCreateDialog} disabled={Boolean(schemaMessage)}>
            <Store className="mr-2 size-4" />
            New Merchant
          </Button>
        </div>
      </div>

      {schemaMessage && (
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {schemaMessage}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search merchants or aliases"
              className="pl-9"
            />
          </div>

          <Select value={status} onValueChange={(value: 'all' | 'active' | 'inactive') => setStatus(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Merchants</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sortBy}
            onValueChange={(value: 'name' | 'updated_at' | 'alias_count' | 'transaction_count' | 'receipt_count' | 'total_spend') => setSortBy(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated_at">Recently Updated</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="alias_count">Alias Count</SelectItem>
              <SelectItem value="transaction_count">Transaction Count</SelectItem>
              <SelectItem value="receipt_count">Receipt Count</SelectItem>
              <SelectItem value="total_spend">Total Spend</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}>
            {sortDir === 'asc' ? <ArrowUp className="mr-2 size-4" /> : <ArrowDown className="mr-2 size-4" />}
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </Button>
        </div>

        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-3 py-2">
            <div className="text-sm text-muted-foreground">
              {selectedRows.length} merchant{selectedRows.length === 1 ? '' : 's'} selected
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>
                Clear Selection
              </Button>
              <Button size="sm" onClick={() => openMergeDialog()}>
                Merge Selected
              </Button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border bg-card py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : schemaMessage ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">Merchant schema not ready</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Apply the merchant migration, then reload this page.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <h2 className="text-lg font-semibold">No merchants yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Run backfill to link existing transactions and receipts, or create a merchant manually.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                  <th className="px-4 py-3">
                    <Checkbox checked={allSelected} onCheckedChange={(checked) => setSelectedIds(checked ? rows.map((row) => row.id) : [])} />
                  </th>
                  <th className="px-4 py-3 font-medium">Merchant</th>
                  <th className="px-4 py-3 font-medium">Aliases</th>
                  <th className="px-4 py-3 font-medium">Transactions</th>
                  <th className="px-4 py-3 font-medium">Receipts</th>
                  <th className="px-4 py-3 font-medium">Spend</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selected = selectedIds.includes(row.id)
                  const canDelete = row.alias_count === 0 && row.transaction_count === 0 && row.receipt_count === 0 && row.ledger_entry_count === 0

                  return (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="px-4 py-3 align-top">
                        <Checkbox checked={selected} onCheckedChange={(checked) => toggleSelection(row.id, checked === true)} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border bg-background">
                            <MerchantColorDot color_token={row.color_token} color_hex={row.color_hex} className="mr-1.5 size-2" />
                            <MerchantIcon icon_key={row.icon_key} className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{row.name}</span>
                              <Badge variant={row.is_active ? 'default' : 'outline'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>
                              {row.merged_into_merchant_id && <Badge variant="secondary">Merged</Badge>}
                            </div>
                            <p className="mt-1 truncate text-xs text-muted-foreground">{row.normalized_name || 'No normalized name'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">{row.alias_count}</td>
                      <td className="px-4 py-3 align-top">{row.transaction_count}</td>
                      <td className="px-4 py-3 align-top">{row.receipt_count}</td>
                      <td className="px-4 py-3 align-top font-medium">{formatCurrency(row.total_spend)}</td>
                      <td className="px-4 py-3 align-top text-muted-foreground">{formatDate(row.updated_at)}</td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => void openDetail(row)}>View</Button>
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(row)}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => openMergeDialog(row.id)}>Merge</Button>
                          {canDelete && (
                            <Button size="sm" variant="outline" onClick={() => void runDelete(row)}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Merchant Details</DialogTitle>
            <DialogDescription>Review canonical metadata, alias coverage, and linked usage.</DialogDescription>
          </DialogHeader>
          {detailLoading || !detail ? (
            <div className="py-8 text-sm text-muted-foreground">Loading merchant details...</div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full border bg-background">
                  <MerchantColorDot color_token={detail.color_token} color_hex={detail.color_hex} className="mr-1.5 size-2" />
                  <MerchantIcon icon_key={detail.icon_key} className="size-4.5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold">{detail.name}</h3>
                    <Badge variant={detail.is_active ? 'default' : 'outline'}>{detail.is_active ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{detail.normalized_name || 'No normalized name'}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Aliases</p>
                  <p className="mt-1 text-xl font-semibold">{detail.alias_count}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Transactions</p>
                  <p className="mt-1 text-xl font-semibold">{detail.transaction_count}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Receipts</p>
                  <p className="mt-1 text-xl font-semibold">{detail.receipt_count}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Total Spend</p>
                  <p className="mt-1 text-xl font-semibold">{formatCurrency(detail.total_spend)}</p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Aliases</h4>
                {detail.aliases.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No aliases linked yet.</p>
                ) : (
                  <div className="max-h-64 space-y-2 overflow-auto rounded-lg border p-3">
                    {detail.aliases.map((alias) => (
                      <div key={alias.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                        <div>
                          <p className="font-medium">{alias.raw_name || alias.normalized_raw_name || 'Alias'}</p>
                          <p className="text-xs text-muted-foreground">
                            {alias.source_type} · {alias.normalized_raw_name || 'No normalized value'}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDate(alias.updated_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p><span className="text-muted-foreground">Notes:</span> {detail.notes || 'None'}</p>
                <p className="mt-1"><span className="text-muted-foreground">Created:</span> {formatDate(detail.created_at)}</p>
                <p className="mt-1"><span className="text-muted-foreground">Updated:</span> {formatDate(detail.updated_at)}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingMerchant ? 'Edit Merchant' : 'Create Merchant'}</DialogTitle>
            <DialogDescription>Customize the canonical merchant display and optionally add a manual alias.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Display Name</label>
                <Input value={merchantName} onChange={(event) => setMerchantName(event.target.value)} placeholder="McDonald's" />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Status</label>
                <Select value={merchantState} onValueChange={(value: 'active' | 'inactive') => setMerchantState(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Notes</label>
              <textarea
                value={merchantNotes}
                onChange={(event) => setMerchantNotes(event.target.value)}
                placeholder="Optional notes about this merchant"
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Icon</label>
                <div className="grid grid-cols-3 gap-2 rounded-lg border p-3 sm:grid-cols-4">
                  <button
                    type="button"
                    className={cn(
                      'rounded-md border px-2 py-2 text-left text-sm',
                      merchantIcon === 'auto' && 'border-primary bg-primary/5',
                    )}
                    onClick={() => setMerchantIcon('auto')}
                  >
                    Auto
                  </button>
                  {ICON_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-2 py-2 text-left text-sm',
                        merchantIcon === option.value && 'border-primary bg-primary/5',
                      )}
                      onClick={() => setMerchantIcon(option.value)}
                    >
                      <MerchantIcon icon_key={option.value} className="size-4" />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Color</label>
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    <button
                      type="button"
                      className={cn(
                        'rounded-md border px-2 py-2 text-left text-sm',
                        merchantColor === 'auto' && 'border-primary bg-primary/5',
                      )}
                      onClick={() => setMerchantColor('auto')}
                    >
                      Auto
                    </button>
                    {COLOR_OPTIONS.map((colorToken) => (
                      <button
                        key={colorToken}
                        type="button"
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2 py-2 text-left text-sm',
                          merchantColor === colorToken && 'border-primary bg-primary/5',
                        )}
                        onClick={() => setMerchantColor(colorToken)}
                      >
                        <MerchantColorDot color_token={colorToken} color_hex={null} className="size-2.5" />
                        <span>{colorToken}</span>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Optional Hex Override</label>
                    <Input value={merchantColorHex} onChange={(event) => setMerchantColorHex(event.target.value)} placeholder="#D97706" />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Manual Alias</label>
              <Input
                value={merchantAlias}
                onChange={(event) => setMerchantAlias(event.target.value)}
                placeholder="Add a raw merchant variant to this canonical merchant"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveMerchant()} disabled={saving}>
              {saving ? 'Saving...' : 'Save Merchant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Merge Merchants</DialogTitle>
            <DialogDescription>Choose the survivor merchant, preview the impact, then merge selected merchants safely.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              value={mergeSearch}
              onChange={(event) => setMergeSearch(event.target.value)}
              placeholder="Search merchants to include"
            />

            <div className="max-h-72 overflow-auto rounded-lg border">
              <div className="divide-y">
                {mergeCandidates.map((row) => {
                  const checked = mergeSelectionIds.includes(row.id)
                  return (
                    <label key={row.id} className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Checkbox checked={checked} onCheckedChange={(value) => toggleMergeSelection(row.id, value === true)} />
                        <div className="flex items-center gap-2">
                          <MerchantColorDot color_token={row.color_token} color_hex={row.color_hex} className="size-2.5" />
                          <MerchantIcon icon_key={row.icon_key} className="size-4" />
                          <div>
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {row.alias_count} aliases · {row.transaction_count} transactions · {row.receipt_count} receipts
                            </p>
                          </div>
                        </div>
                      </div>
                      {survivorId === row.id && <Check className="size-4 text-primary" />}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Survivor Merchant</label>
              <Select value={survivorId} onValueChange={setSurvivorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select survivor" />
                </SelectTrigger>
                <SelectContent>
                  {rows
                    .filter((row) => mergeSelectionIds.includes(row.id))
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-sm font-medium">Victims</p>
              {victimIds.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Select at least two merchants, then choose which one survives.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {rows
                    .filter((row) => victimIds.includes(row.id))
                    .map((row) => (
                      <Badge key={row.id} variant="outline">
                        {row.name}
                      </Badge>
                    ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Merge Preview</p>
                {mergePreviewLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </div>
              {!mergePreview ? (
                <p className="mt-2 text-sm text-muted-foreground">Preview appears when a survivor and at least one victim are selected.</p>
              ) : (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Aliases</p>
                    <p className="text-lg font-semibold">{mergePreview.aliases}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Transactions</p>
                    <p className="text-lg font-semibold">{mergePreview.statementTransactions}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Receipts</p>
                    <p className="text-lg font-semibold">{mergePreview.receipts}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ledger Entries</p>
                    <p className="text-lg font-semibold">{mergePreview.ledgerEntries}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={() => void runMerge()} disabled={mergeSaving || !survivorId || victimIds.length === 0}>
              {mergeSaving ? 'Merging...' : 'Merge Merchants'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
