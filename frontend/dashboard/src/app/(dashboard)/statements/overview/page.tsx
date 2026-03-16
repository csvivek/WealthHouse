'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CreditCard, Download, FileText, Landmark, Loader2, Wallet } from 'lucide-react'
import { ExecutivePage } from '@/components/executive/page'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatCurrency, formatDate, formatDateShort } from '@/lib/format'
import type { StatementOverviewCard, StatementOverviewType } from '@/lib/statements/overview'
import { cn } from '@/lib/utils'

const BANK_ORDER = ['DBS', 'OCBC', 'Citi', 'HSBC', 'Trust', 'UOB', 'GXS']
const BANK_COLORS: Record<string, string> = {
  DBS: 'bg-rose-500',
  OCBC: 'bg-red-500',
  Citi: 'bg-blue-500',
  HSBC: 'bg-rose-600',
  Trust: 'bg-orange-500',
  UOB: 'bg-amber-500',
  GXS: 'bg-violet-500',
}

const TYPE_ORDER: StatementOverviewType[] = [
  'Credit Card',
  'Savings',
  'Credit Line',
  'Balance Transfer',
  'Investment',
  'Other',
]

function fmtCurrency(value: number | null, currency = 'SGD') {
  return value == null ? '—' : formatCurrency(value, currency)
}

function toDateValue(value?: string | null) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysUntilDue(value?: string | null) {
  const dueDate = toDateValue(value)
  if (!dueDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = dueDate.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function getLiabilityAmount(card: StatementOverviewCard) {
  if (card.canonicalType === 'Savings') return null
  return card.summary.grandTotal ?? card.summary.closingBalance ?? null
}

function getCardAccent(card: StatementOverviewCard) {
  return BANK_COLORS[card.bankLabel] || 'bg-slate-500'
}

function getTypeTone(type: StatementOverviewType) {
  switch (type) {
    case 'Credit Card':
      return 'border-amber-400/30 bg-amber-400/10 text-amber-100'
    case 'Savings':
      return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
    case 'Credit Line':
      return 'border-rose-400/30 bg-rose-400/10 text-rose-100'
    case 'Balance Transfer':
      return 'border-violet-400/30 bg-violet-400/10 text-violet-100'
    case 'Investment':
      return 'border-sky-400/30 bg-sky-400/10 text-sky-100'
    default:
      return 'border-slate-400/30 bg-slate-400/10 text-slate-100'
  }
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'committed'
    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
    : 'border-orange-400/30 bg-orange-400/10 text-orange-100'

  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]', tone)}>
      {status === 'committed' ? 'Committed' : 'In Review'}
    </span>
  )
}

function MetricTile({
  label,
  value,
  tone = 'text-white',
  sublabel,
}: {
  label: string
  value: string
  tone?: string
  sublabel?: string | null
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className={cn('mt-1 font-mono text-sm font-medium', tone)}>{value}</div>
      {sublabel ? <div className="mt-1 text-xs text-slate-500">{sublabel}</div> : null}
    </div>
  )
}

function UtilizationBar({
  used,
  limit,
}: {
  used: number | null
  limit: number | null
}) {
  if (used == null || limit == null || limit <= 0) return null
  const pct = Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
  const barTone = pct >= 80 ? 'bg-rose-400' : pct >= 50 ? 'bg-amber-400' : 'bg-emerald-400'

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
        <span>Utilization</span>
        <span className="font-mono text-xs text-white">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className={cn('h-full rounded-full', barTone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TransactionPreview({
  card,
}: {
  card: StatementOverviewCard
}) {
  if (card.transactions.length === 0) return null

  return (
    <div className="border-t border-white/10 px-5 py-4">
      <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">Recent transactions</div>
      <div className="space-y-2">
        {card.transactions.map((transaction) => (
          <div
            key={transaction.id}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
              transaction.isBalanceTransferInstalment ? 'bg-amber-400/10' : 'bg-white/[0.03]',
            )}
          >
            <div className="w-16 shrink-0 font-mono text-[11px] text-slate-400">
              {formatDateShort(transaction.date)}
            </div>
            <div className="min-w-0 flex-1 truncate text-sm text-slate-100">{transaction.description}</div>
            <div className={cn(
              'font-mono text-sm font-medium',
              transaction.txnType === 'credit' ? 'text-emerald-300' : transaction.isBalanceTransferInstalment ? 'text-amber-200' : 'text-slate-100',
            )}>
              {transaction.txnType === 'credit' ? '+' : '−'}
              {formatCurrency(transaction.amount, transaction.currency)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SubCardBreakdown({
  card,
}: {
  card: StatementOverviewCard
}) {
  if (card.subCards.length === 0) return null

  return (
    <div className="border-t border-white/10 px-5 py-4">
      <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        {card.subCards.length > 1 ? 'Cards on statement' : 'Card breakdown'}
      </div>
      <div className="space-y-2">
        {card.subCards.map((subCard) => (
          <div key={subCard.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-100">{subCard.name}</div>
              <div className="text-xs text-slate-400">
                {subCard.last4 ? `•••• ${subCard.last4}` : 'Statement activity'}
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm text-slate-100">{fmtCurrency(subCard.netAmount, card.currency)}</div>
              <div className="text-xs text-slate-500">
                debits {fmtCurrency(subCard.debitTotal, card.currency)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatementCardView({
  card,
}: {
  card: StatementOverviewCard
}) {
  const dueDays = daysUntilDue(card.summary.paymentDueDate)
  const dueTone = dueDays == null
    ? null
    : dueDays <= 7
      ? 'border-rose-400/30 bg-rose-400/10 text-rose-100'
      : dueDays <= 14
        ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
        : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
  const liabilityAmount = getLiabilityAmount(card)
  const activityIcon = card.canonicalType === 'Credit Card'
    ? CreditCard
    : card.canonicalType === 'Savings'
      ? Landmark
      : Wallet
  const ActivityIcon = activityIcon

  return (
    <Card className="overflow-hidden border-white/10 bg-[linear-gradient(180deg,rgba(12,18,31,0.96),rgba(7,10,18,1))] text-white shadow-[0_24px_80px_rgba(3,7,18,0.35)]">
      <div className={cn('h-1 w-full', getCardAccent(card))} />
      <div className="border-b border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-400">
              <span>{card.bankLabel}</span>
              <span className="inline-flex size-1.5 rounded-full bg-white/30" />
              <ActivityIcon className="size-3.5" />
            </div>
            <div className="mt-2 truncate text-lg font-semibold tracking-[-0.03em] text-white">{card.title}</div>
            {card.subtitle ? <div className="mt-1 truncate text-sm text-slate-400">{card.subtitle}</div> : null}
            {card.accountHint ? <div className="mt-1 font-mono text-xs text-slate-500">{card.accountHint}</div> : null}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge status={card.status} />
            <span className={cn('inline-flex max-w-[180px] items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]', getTypeTone(card.canonicalType))}>
              <span className="truncate">{card.badgeLabel}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        {card.canonicalType === 'Savings' ? (
          <>
            <MetricTile label="Opening Balance" value={fmtCurrency(card.summary.openingBalance, card.currency)} tone="text-slate-200" />
            <MetricTile label="Closing Balance" value={fmtCurrency(card.summary.closingBalance, card.currency)} tone="text-emerald-200" />
            <MetricTile label="Transactions" value={String(card.transactionCount)} sublabel={card.duplicateCount > 0 ? `${card.duplicateCount} duplicate flag(s)` : null} />
          </>
        ) : (
          <>
            <MetricTile label="Credit Limit" value={fmtCurrency(card.summary.creditLimit, card.currency)} />
            <MetricTile label="Statement Due" value={fmtCurrency(liabilityAmount, card.currency)} tone="text-rose-100" />
            <MetricTile label="Min Payment" value={fmtCurrency(card.summary.minimumPayment, card.currency)} tone="text-amber-100" />
          </>
        )}
      </div>

      {card.canonicalType !== 'Savings' ? (
        <div className="px-5 pb-4">
          <UtilizationBar used={liabilityAmount} limit={card.summary.creditLimit} />
        </div>
      ) : null}

      <SubCardBreakdown card={card} />
      <TransactionPreview card={card} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="min-w-0 space-y-1">
          <div className="text-xs text-slate-400">
            Statement {card.statementDate ? formatDate(card.statementDate) : card.periodStart && card.periodEnd ? `${formatDate(card.periodStart)} – ${formatDate(card.periodEnd)}` : 'date unavailable'}
          </div>
          {!card.downloadAvailable ? (
            <div className="text-xs text-slate-500">{card.downloadUnavailableReason}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {card.summary.paymentDueDate ? (
            <Badge variant="outline" className={cn('rounded-full px-3 py-1 text-[11px]', dueTone)}>
              Due {formatDate(card.summary.paymentDueDate)}
            </Badge>
          ) : null}
          <Button asChild size="sm" variant="outline" className="border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.08]">
            <Link href={card.reviewUrl}>{card.reviewLabel}</Link>
          </Button>
          {card.downloadAvailable && card.downloadUrl ? (
            <Button asChild size="sm" className="gap-2 bg-white text-slate-950 hover:bg-slate-100">
              <a href={card.downloadUrl}>
                <Download className="size-4" />
                Download original
              </a>
            </Button>
          ) : (
            <Button size="sm" disabled className="gap-2 bg-white/10 text-slate-400">
              <Download className="size-4" />
              Download original
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function FilterPill({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-white/30 bg-white/10 text-white'
          : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-100',
      )}
    >
      {label}
    </button>
  )
}

export default function StatementsOverviewPage() {
  const [cards, setCards] = useState<StatementOverviewCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bankFilter, setBankFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState<StatementOverviewType | 'All'>('All')

  useEffect(() => {
    let cancelled = false

    async function loadOverview() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/statements/overview')
        const payload = await response.json().catch(() => ({ cards: [] }))
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load statement overview')
        }

        if (!cancelled) {
          setCards((payload.cards ?? []) as StatementOverviewCard[])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load statement overview')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadOverview()

    return () => {
      cancelled = true
    }
  }, [])

  const bankOptions = useMemo(() => {
    const banks = Array.from(new Set(cards.map((card) => card.bankLabel)))
    const ordered = BANK_ORDER.filter((bank) => banks.includes(bank))
    const remaining = banks.filter((bank) => !BANK_ORDER.includes(bank)).sort((left, right) => left.localeCompare(right))
    return ['All', ...ordered, ...remaining]
  }, [cards])

  const visibleTypes = useMemo(() => {
    const source = bankFilter === 'All' ? cards : cards.filter((card) => card.bankLabel === bankFilter)
    const types = Array.from(new Set(source.map((card) => card.canonicalType)))
    return ['All', ...TYPE_ORDER.filter((type) => types.includes(type))]
  }, [bankFilter, cards])

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      if (bankFilter !== 'All' && card.bankLabel !== bankFilter) return false
      if (typeFilter !== 'All' && card.canonicalType !== typeFilter) return false
      return true
    })
  }, [bankFilter, cards, typeFilter])

  const groupedCards = useMemo(() => {
    const map = new Map<string, StatementOverviewCard[]>()
    for (const card of filteredCards) {
      const group = map.get(card.bankLabel) ?? []
      group.push(card)
      map.set(card.bankLabel, group)
    }
    return map
  }, [filteredCards])

  const activeBanks = useMemo(() => {
    if (bankFilter !== 'All') return [bankFilter]
    const grouped = Array.from(groupedCards.keys())
    const ordered = BANK_ORDER.filter((bank) => grouped.includes(bank))
    const remaining = grouped.filter((bank) => !BANK_ORDER.includes(bank)).sort((left, right) => left.localeCompare(right))
    return [...ordered, ...remaining]
  }, [bankFilter, groupedCards])

  const metrics = useMemo(() => {
    const totalCreditLimit = filteredCards.reduce((sum, card) => sum + (card.summary.creditLimit ?? 0), 0)
    const savingsBalance = filteredCards
      .filter((card) => card.canonicalType === 'Savings')
      .reduce((sum, card) => sum + (card.summary.closingBalance ?? 0), 0)
    const totalOutstanding = filteredCards.reduce((sum, card) => sum + (getLiabilityAmount(card) ?? 0), 0)

    return {
      statements: filteredCards.length,
      totalCreditLimit,
      savingsBalance,
      totalOutstanding,
    }
  }, [filteredCards])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <ExecutivePage className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.18),transparent_35%),linear-gradient(180deg,rgba(12,18,31,0.96),rgba(7,10,18,1))] px-6 py-6 text-white shadow-[0_24px_80px_rgba(3,7,18,0.35)] sm:px-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Statement Library</div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Statements Overview</h1>
              <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
                Review committed and in-review statement imports, skim transaction activity, and download original files for storage-backed uploads.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="gap-2 bg-white text-slate-950 hover:bg-slate-100">
                <Link href="/statements">
                  Import Statement
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Badge variant="outline" className="border-white/15 bg-white/[0.03] text-slate-200">
                {cards.length} recent imports loaded
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricTile label="Statements" value={String(metrics.statements)} />
            <MetricTile label="Credit Limits" value={fmtCurrency(metrics.totalCreditLimit)} />
            <MetricTile label="Savings" value={fmtCurrency(metrics.savingsBalance)} tone="text-emerald-200" />
            <MetricTile label="Outstanding" value={fmtCurrency(metrics.totalOutstanding)} tone="text-rose-200" />
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-20 rounded-[1.5rem] border border-white/10 bg-[rgba(7,10,18,0.94)] px-4 py-4 backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Bank</span>
            {bankOptions.map((bank) => (
              <FilterPill
                key={bank}
                label={bank}
                active={bankFilter === bank}
                onClick={() => {
                  setBankFilter(bank)
                  setTypeFilter('All')
                }}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Type</span>
            {visibleTypes.map((type) => (
              <FilterPill
                key={type}
                label={type}
                active={typeFilter === type}
                onClick={() => setTypeFilter(type as StatementOverviewType | 'All')}
              />
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <Card className="border-rose-500/20 bg-rose-500/10 p-6 text-rose-100">
          <div className="flex items-center gap-3">
            <FileText className="size-5" />
            <div>
              <div className="font-medium">Statement overview unavailable</div>
              <div className="text-sm text-rose-100/80">{error}</div>
            </div>
          </div>
        </Card>
      ) : filteredCards.length === 0 ? (
        <Card className="border-white/10 bg-[linear-gradient(180deg,rgba(12,18,31,0.96),rgba(7,10,18,1))] p-10 text-center text-white">
          <div className="mx-auto max-w-md space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
              <FileText className="size-6 text-slate-400" />
            </div>
            <div className="text-xl font-semibold tracking-[-0.03em]">No statements match this filter.</div>
            <div className="text-sm text-slate-400">Try another bank or statement type, or return to the import workspace to upload a new file.</div>
          </div>
        </Card>
      ) : (
        activeBanks.map((bank) => {
          const bankCards = groupedCards.get(bank)
          if (!bankCards?.length) return null

          return (
            <section key={bank} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className={cn('size-2 rounded-full', BANK_COLORS[bank] || 'bg-slate-500')} />
                <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{bank}</div>
                <div className="h-px flex-1 bg-white/10" />
                <div className="text-xs text-slate-500">{bankCards.length} statement{bankCards.length === 1 ? '' : 's'}</div>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {bankCards.map((card) => (
                  <StatementCardView key={card.id} card={card} />
                ))}
              </div>
            </section>
          )
        })
      )}
    </ExecutivePage>
  )
}
