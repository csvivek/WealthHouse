'use client'

import React, { useState, useEffect, useCallback, type FormEvent } from 'react'
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  HandCoins,
  Loader2,
  Plus,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Counterparty {
  id: string
  name: string
  relationship: string | null
  phone: string | null
  counterparty_type: string | null
}

interface Repayment {
  id: string
  repayment_date: string
  amount: number
  event_type: string
  method: string | null
  notes: string | null
}

interface Advance {
  id: string
  household_id: string | null
  direction: 'given' | 'taken' | null
  status: 'pending' | 'partial' | 'settled' | 'written_off'
  expected_recovery_amount: number
  payment_mode: string | null
  is_cash_advance: boolean
  due_date: string | null
  writeoff_date: string | null
  writeoff_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  counterparties: Counterparty | null
  advance_repayments: Repayment[]
  // computed
  total_repaid: number
  outstanding_amount: number
  days_outstanding: number
}

interface Summary {
  open_given: number
  open_taken: number
  overdue_count: number
  writeoff_eligible_count: number
}

// ─── Config ───────────────────────────────────────────────────────────────────

const statusConfig = {
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  },
  partial: {
    label: 'Partial',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  },
  settled: {
    label: 'Settled',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  },
  written_off: {
    label: 'Written Off',
    className: 'bg-gray-100 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400',
  },
}

const eventTypeLabels: Record<string, string> = {
  repayment: 'Repayment',
  recovery: 'Recovery',
  adjustment: 'Adjustment',
  writeoff: 'Write-off',
}

const paymentModeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Card' },
  { value: 'paynow', label: 'PayNow' },
  { value: 'other', label: 'Other' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdvancesPage() {
  const [advances, setAdvances] = useState<Advance[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [summary, setSummary] = useState<Summary>({
    open_given: 0,
    open_taken: 0,
    overdue_count: 0,
    writeoff_eligible_count: 0,
  })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('open')
  const [directionFilter, setDirectionFilter] = useState('all')

  // Create advance dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    direction: 'given' as 'given' | 'taken',
    counterparty_id: '',
    counterparty_name: '',
    counterparty_relationship: '',
    amount: '',
    advance_date: new Date().toISOString().split('T')[0],
    due_date: '',
    payment_mode: '',
    is_cash_advance: false,
    notes: '',
  })

  // Detail sheet
  const [selectedAdvance, setSelectedAdvance] = useState<Advance | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Repayment dialog
  const [repaymentOpen, setRepaymentOpen] = useState(false)
  const [addingRepayment, setAddingRepayment] = useState(false)
  const [repaymentForm, setRepaymentForm] = useState({
    amount: '',
    repayment_date: new Date().toISOString().split('T')[0],
    event_type: 'repayment',
    method: '',
    notes: '',
  })

  // Write-off dialog
  const [writeoffOpen, setWriteoffOpen] = useState(false)
  const [writingOff, setWritingOff] = useState(false)
  const [writeoffReason, setWriteoffReason] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [advRes, cpRes] = await Promise.all([
        fetch('/api/advances'),
        fetch('/api/counterparties'),
      ])
      if (advRes.ok) {
        const json = await advRes.json()
        setAdvances(json.advances ?? [])
        if (json.summary) setSummary(json.summary)
      }
      if (cpRes.ok) {
        const json = await cpRes.json()
        setCounterparties(json.counterparties ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Filtered lists by tab ───────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0]

  function applyFilters(list: Advance[]) {
    let filtered = list
    if (directionFilter !== 'all') {
      filtered = filtered.filter(a => a.direction === directionFilter)
    }
    return filtered
  }

  const openAdvances = applyFilters(
    advances.filter(
      a =>
        ['pending', 'partial'].includes(a.status) &&
        (!a.due_date || a.due_date >= today),
    ),
  )
  const overdueAdvances = applyFilters(
    advances.filter(
      a => ['pending', 'partial'].includes(a.status) && a.due_date && a.due_date < today,
    ),
  )
  const settledAdvances = applyFilters(advances.filter(a => a.status === 'settled'))
  const writtenOffAdvances = applyFilters(advances.filter(a => a.status === 'written_off'))

  // ── Create advance ──────────────────────────────────────────────────────────

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (creating) return
    setCreating(true)
    try {
      const body: Record<string, unknown> = {
        direction: createForm.direction,
        amount: parseFloat(createForm.amount),
        advance_date: createForm.advance_date,
        payment_mode: createForm.payment_mode || null,
        is_cash_advance: createForm.is_cash_advance,
        notes: createForm.notes || null,
        due_date: createForm.due_date || null,
      }

      if (createForm.counterparty_id) {
        body.counterparty_id = createForm.counterparty_id
      } else {
        body.counterparty_name = createForm.counterparty_name.trim()
        body.counterparty_relationship = createForm.counterparty_relationship || null
      }

      const res = await fetch('/api/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create advance')

      toast.success('Advance recorded successfully')
      setCreateOpen(false)
      setCreateForm({
        direction: 'given',
        counterparty_id: '',
        counterparty_name: '',
        counterparty_relationship: '',
        amount: '',
        advance_date: new Date().toISOString().split('T')[0],
        due_date: '',
        payment_mode: '',
        is_cash_advance: false,
        notes: '',
      })
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create advance')
    } finally {
      setCreating(false)
    }
  }

  // ── Record repayment ────────────────────────────────────────────────────────

  async function handleAddRepayment(e: FormEvent) {
    e.preventDefault()
    if (!selectedAdvance || addingRepayment) return
    setAddingRepayment(true)
    try {
      const res = await fetch(`/api/advances/${selectedAdvance.id}/repayments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(repaymentForm.amount),
          repayment_date: repaymentForm.repayment_date,
          event_type: repaymentForm.event_type,
          method: repaymentForm.method || null,
          notes: repaymentForm.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to record repayment')

      toast.success('Repayment recorded')
      setRepaymentOpen(false)
      setRepaymentForm({
        amount: '',
        repayment_date: new Date().toISOString().split('T')[0],
        event_type: 'repayment',
        method: '',
        notes: '',
      })
      await fetchData()
      // Refresh selected advance from updated data
      const updatedList = await fetch('/api/advances').then(r => r.json())
      const updated = (updatedList.advances ?? []).find((a: Advance) => a.id === selectedAdvance.id)
      if (updated) setSelectedAdvance(updated)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record repayment')
    } finally {
      setAddingRepayment(false)
    }
  }

  // ── Write-off ───────────────────────────────────────────────────────────────

  async function handleWriteoff() {
    if (!selectedAdvance || writingOff) return
    setWritingOff(true)
    try {
      const res = await fetch(`/api/advances/${selectedAdvance.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'written_off',
          writeoff_date: today,
          writeoff_reason: writeoffReason || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to write off advance')

      toast.success('Advance written off')
      setWriteoffOpen(false)
      setWriteoffReason('')
      setSheetOpen(false)
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to write off advance')
    } finally {
      setWritingOff(false)
    }
  }

  // ── Row click ───────────────────────────────────────────────────────────────

  function openDetail(adv: Advance) {
    setSelectedAdvance(adv)
    setSheetOpen(true)
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  function DirectionBadge({ direction }: { direction: 'given' | 'taken' | null }) {
    if (!direction) return null
    return direction === 'given' ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
        <ArrowUpRight className="size-3" />
        Given
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-400">
        <ArrowDownLeft className="size-3" />
        Taken
      </span>
    )
  }

  function StatusBadge({ status }: { status: string }) {
    const config = statusConfig[status as keyof typeof statusConfig] ?? statusConfig.pending
    return (
      <Badge className={cn('border-0 text-xs', config.className)}>{config.label}</Badge>
    )
  }

  function AdvanceTable({ items }: { items: Advance[] }) {
    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <HandCoins className="mb-3 size-10 opacity-30" />
          <p className="text-sm">No advances in this category</p>
        </div>
      )
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-3 pr-4 font-medium">Counterparty</th>
              <th className="pb-3 pr-4 font-medium">Direction</th>
              <th className="pb-3 pr-4 font-medium text-right">Original</th>
              <th className="pb-3 pr-4 font-medium text-right">Outstanding</th>
              <th className="pb-3 pr-4 font-medium">Advance Date</th>
              <th className="pb-3 pr-4 font-medium">Due Date</th>
              <th className="pb-3 pr-4 font-medium">Days</th>
              <th className="pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(adv => {
              const isOverdue =
                adv.due_date &&
                adv.due_date < today &&
                ['pending', 'partial'].includes(adv.status)
              return (
                <tr
                  key={adv.id}
                  className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
                  onClick={() => openDetail(adv)}
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium">{adv.counterparties?.name ?? '—'}</p>
                    {adv.counterparties?.relationship && (
                      <p className="text-xs text-muted-foreground">{adv.counterparties.relationship}</p>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    <DirectionBadge direction={adv.direction} />
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">
                    {formatCurrency(adv.expected_recovery_amount)}
                  </td>
                  <td className="py-3 pr-4 text-right font-medium tabular-nums">
                    {adv.status === 'settled'
                      ? <span className="text-green-600 dark:text-green-400">Settled</span>
                      : adv.status === 'written_off'
                      ? <span className="text-muted-foreground">Written Off</span>
                      : formatCurrency(adv.outstanding_amount)}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {formatDate(adv.created_at.split('T')[0])}
                  </td>
                  <td className="py-3 pr-4">
                    {adv.due_date ? (
                      <span className={cn(isOverdue && 'font-medium text-red-600 dark:text-red-400')}>
                        {formatDate(adv.due_date)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-muted-foreground">
                    {adv.days_outstanding}d
                  </td>
                  <td className="py-3">
                    <StatusBadge status={adv.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // ─── Main render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="Money Workspace"
        title="Advances"
        description="Track money lent to or borrowed from others — from advance to settlement or write-off."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            New Advance
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowUpRight className="size-4 text-emerald-600" />
              Open Given
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.open_given)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ArrowDownLeft className="size-4 text-purple-600" />
              Open Taken
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(summary.open_taken)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock className="size-4 text-red-500" />
              Overdue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.overdue_count}</p>
            <p className="text-xs text-muted-foreground">advances past due date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <TriangleAlert className="size-4 text-amber-500" />
              Write-off Eligible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.writeoff_eligible_count}</p>
            <p className="text-xs text-muted-foreground">open &gt; 365 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Direction filter */}
      <div className="flex items-center gap-2">
        {(['all', 'given', 'taken'] as const).map(dir => (
          <button
            key={dir}
            onClick={() => setDirectionFilter(dir)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              directionFilter === dir
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {dir === 'all' ? 'All' : dir === 'given' ? 'Given' : 'Taken'}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="open">
            Open
            {openAdvances.length > 0 && (
              <span className="ml-1.5 rounded-full bg-yellow-200 px-1.5 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/60 dark:text-yellow-400">
                {openAdvances.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue
            {overdueAdvances.length > 0 && (
              <span className="ml-1.5 rounded-full bg-red-200 px-1.5 py-0.5 text-xs text-red-800 dark:bg-red-900/60 dark:text-red-400">
                {overdueAdvances.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="settled">Settled</TabsTrigger>
          <TabsTrigger value="written_off">Written Off</TabsTrigger>
        </TabsList>

        <TabsContent value="open">
          <Card>
            <CardContent className="pt-4">
              <AdvanceTable items={openAdvances} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="overdue">
          <Card>
            <CardContent className="pt-4">
              <AdvanceTable items={overdueAdvances} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="settled">
          <Card>
            <CardContent className="pt-4">
              <AdvanceTable items={settledAdvances} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="written_off">
          <Card>
            <CardContent className="pt-4">
              <AdvanceTable items={writtenOffAdvances} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ─── Create Advance Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Advance</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {/* Direction */}
            <div className="space-y-1.5">
              <Label>Direction</Label>
              <Select
                value={createForm.direction}
                onValueChange={v =>
                  setCreateForm(f => ({ ...f, direction: v as 'given' | 'taken' }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="given">Given — money lent out</SelectItem>
                  <SelectItem value="taken">Taken — money borrowed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Counterparty */}
            <div className="space-y-1.5">
              <Label>Counterparty</Label>
              <Select
                value={createForm.counterparty_id}
                onValueChange={v => setCreateForm(f => ({ ...f, counterparty_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select existing or type new name below" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Create new —</SelectItem>
                  {counterparties.map(cp => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.name}
                      {cp.relationship ? ` (${cp.relationship})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!createForm.counterparty_id && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Full name *"
                    value={createForm.counterparty_name}
                    onChange={e =>
                      setCreateForm(f => ({ ...f, counterparty_name: e.target.value }))
                    }
                    required
                  />
                  <Input
                    placeholder="Relationship (optional)"
                    value={createForm.counterparty_relationship}
                    onChange={e =>
                      setCreateForm(f => ({ ...f, counterparty_relationship: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>

            {/* Amount + Date row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount (SGD)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={createForm.amount}
                  onChange={e => setCreateForm(f => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Advance Date</Label>
                <Input
                  type="date"
                  value={createForm.advance_date}
                  onChange={e => setCreateForm(f => ({ ...f, advance_date: e.target.value }))}
                  required
                />
              </div>
            </div>

            {/* Due date + Payment mode row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Due Date (optional)</Label>
                <Input
                  type="date"
                  value={createForm.due_date}
                  onChange={e => setCreateForm(f => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Mode</Label>
                <Select
                  value={createForm.payment_mode}
                  onValueChange={v => setCreateForm(f => ({ ...f, payment_mode: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentModeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cash advance toggle */}
            <div className="flex items-center gap-2">
              <input
                id="is_cash_advance"
                type="checkbox"
                checked={createForm.is_cash_advance}
                onChange={e =>
                  setCreateForm(f => ({ ...f, is_cash_advance: e.target.checked }))
                }
                className="size-4 rounded border"
              />
              <Label htmlFor="is_cash_advance" className="cursor-pointer text-sm">
                This is a cash advance
              </Label>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Purpose, context, etc."
                value={createForm.notes}
                onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
                Record Advance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Detail Sheet ─────────────────────────────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedAdvance && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  {selectedAdvance.counterparties?.name ?? 'Unknown'}
                  <DirectionBadge direction={selectedAdvance.direction} />
                  <StatusBadge status={selectedAdvance.status} />
                </SheetTitle>
              </SheetHeader>

              {/* Summary grid */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Original Amount</p>
                  <p className="text-lg font-bold tabular-nums">
                    {formatCurrency(selectedAdvance.expected_recovery_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-bold tabular-nums">
                    {selectedAdvance.status === 'settled'
                      ? <span className="text-green-600 dark:text-green-400">Settled</span>
                      : selectedAdvance.status === 'written_off'
                      ? <span className="text-muted-foreground">Written Off</span>
                      : formatCurrency(selectedAdvance.outstanding_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Repaid</p>
                  <p className="font-semibold tabular-nums">
                    {formatCurrency(selectedAdvance.total_repaid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days Outstanding</p>
                  <p className="font-semibold">{selectedAdvance.days_outstanding}d</p>
                </div>
              </div>

              {/* Metadata */}
              <div className="mt-4 space-y-2 text-sm">
                {selectedAdvance.due_date && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Calendar className="size-3.5" />
                      Due Date
                    </span>
                    <span
                      className={cn(
                        selectedAdvance.due_date < today &&
                          ['pending', 'partial'].includes(selectedAdvance.status) &&
                          'font-medium text-red-600 dark:text-red-400',
                      )}
                    >
                      {formatDate(selectedAdvance.due_date)}
                    </span>
                  </div>
                )}
                {selectedAdvance.payment_mode && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payment Mode</span>
                    <span className="capitalize">{selectedAdvance.payment_mode.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {selectedAdvance.is_cash_advance && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <Badge variant="outline" className="text-xs">Cash Advance</Badge>
                  </div>
                )}
                {selectedAdvance.counterparties?.relationship && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Relationship</span>
                    <span>{selectedAdvance.counterparties.relationship}</span>
                  </div>
                )}
                {selectedAdvance.notes && (
                  <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                    {selectedAdvance.notes}
                  </div>
                )}
                {selectedAdvance.writeoff_date && (
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs dark:border-gray-800 dark:bg-gray-900/40">
                    <p className="font-medium text-gray-600 dark:text-gray-400">
                      Written off on {formatDate(selectedAdvance.writeoff_date)}
                    </p>
                    {selectedAdvance.writeoff_reason && (
                      <p className="text-muted-foreground">{selectedAdvance.writeoff_reason}</p>
                    )}
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* Repayment history */}
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium">Repayment History</p>
                {!['settled', 'written_off'].includes(selectedAdvance.status) && (
                  <Button size="sm" variant="outline" onClick={() => setRepaymentOpen(true)}>
                    <Plus className="mr-1 size-3.5" />
                    Record
                  </Button>
                )}
              </div>

              {selectedAdvance.advance_repayments.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No repayments recorded yet
                </p>
              ) : (
                <div className="space-y-2">
                  {[...selectedAdvance.advance_repayments]
                    .sort((a, b) => b.repayment_date.localeCompare(a.repayment_date))
                    .map(rep => (
                      <div
                        key={rep.id}
                        className="flex items-start justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            {rep.event_type === 'writeoff' ? (
                              <XCircle className="size-3.5 text-gray-500" />
                            ) : (
                              <CheckCircle2 className="size-3.5 text-green-600" />
                            )}
                            <span className="font-medium">
                              {eventTypeLabels[rep.event_type] ?? rep.event_type}
                            </span>
                            {rep.method && (
                              <span className="text-xs text-muted-foreground capitalize">
                                via {rep.method.replace(/_/g, ' ')}
                              </span>
                            )}
                          </div>
                          {rep.notes && (
                            <p className="mt-0.5 pl-5 text-xs text-muted-foreground">{rep.notes}</p>
                          )}
                          <p className="mt-0.5 pl-5 text-xs text-muted-foreground">
                            {formatDate(rep.repayment_date)}
                          </p>
                        </div>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(rep.amount)}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Actions */}
              {!['settled', 'written_off'].includes(selectedAdvance.status) && (
                <>
                  <Separator className="my-4" />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-600 dark:text-red-400"
                      onClick={() => setWriteoffOpen(true)}
                    >
                      <AlertCircle className="mr-1.5 size-3.5" />
                      Write Off
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ─── Repayment Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={repaymentOpen} onOpenChange={setRepaymentOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Repayment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddRepayment} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={repaymentForm.amount}
                  onChange={e => setRepaymentForm(f => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={repaymentForm.repayment_date}
                  onChange={e =>
                    setRepaymentForm(f => ({ ...f, repayment_date: e.target.value }))
                  }
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Event Type</Label>
                <Select
                  value={repaymentForm.event_type}
                  onValueChange={v => setRepaymentForm(f => ({ ...f, event_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="repayment">Repayment</SelectItem>
                    <SelectItem value="recovery">Recovery</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Method (optional)</Label>
                <Select
                  value={repaymentForm.method}
                  onValueChange={v => setRepaymentForm(f => ({ ...f, method: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentModeOptions.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Reference, context, etc."
                value={repaymentForm.notes}
                onChange={e => setRepaymentForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRepaymentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addingRepayment}>
                {addingRepayment && <Loader2 className="mr-2 size-4 animate-spin" />}
                Record
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Write-off Confirm Dialog ──────────────────────────────────────────── */}
      <Dialog open={writeoffOpen} onOpenChange={setWriteoffOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Write Off Advance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will mark the advance as written off. This action cannot be undone.
              Outstanding amount:{' '}
              <strong>{selectedAdvance && formatCurrency(selectedAdvance.outstanding_amount)}</strong>
            </p>
            <div className="space-y-1.5">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="e.g. Uncollectable, forgiven, etc."
                value={writeoffReason}
                onChange={e => setWriteoffReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWriteoffOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={writingOff}
              onClick={handleWriteoff}
            >
              {writingOff && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirm Write Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ExecutivePage>
  )
}
