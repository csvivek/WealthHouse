'use client'

import { ChevronDown, LayoutGrid, LayoutList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DATE_PERIOD_LABELS, type DatePeriod } from '@/lib/date-periods'
import { cn } from '@/lib/utils'

export type AnalyticsDirection = 'all' | 'debit' | 'credit'
export type AnalyticsDimension = 'category' | 'tag'
export type AnalyticsView = 'simple' | 'advanced'

export interface AnalyticsFilters {
  period: DatePeriod
  accountIds: string[]
  direction: AnalyticsDirection
  dimension: AnalyticsDimension
  view: AnalyticsView
}

export interface AccountOption {
  id: string
  label: string
}

interface AnalyticsFilterBarProps {
  filters: AnalyticsFilters
  accounts: AccountOption[]
  onChange: (filters: AnalyticsFilters) => void
}

const PERIOD_OPTIONS: DatePeriod[] = ['this_week', 'this_month', 'this_quarter', 'this_year', 'all_history']

const DIRECTION_OPTIONS: { value: AnalyticsDirection; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'debit', label: 'Debits' },
  { value: 'credit', label: 'Credits' },
]

export function AnalyticsFilterBar({ filters, accounts, onChange }: AnalyticsFilterBarProps) {
  const set = (patch: Partial<AnalyticsFilters>) => onChange({ ...filters, ...patch })

  const selectedAccountLabels = filters.accountIds.length === 0
    ? 'All Accounts'
    : filters.accountIds.length === 1
      ? (accounts.find((a) => a.id === filters.accountIds[0])?.label ?? '1 account')
      : `${filters.accountIds.length} accounts`

  const toggleAccount = (id: string) => {
    const next = filters.accountIds.includes(id)
      ? filters.accountIds.filter((a) => a !== id)
      : [...filters.accountIds, id]
    set({ accountIds: next })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Left: period + account + direction */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Period pills */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => set({ period: p })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                filters.period === p
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {DATE_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Account multi-select */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              {selectedAccountLabels}
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Accounts</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={filters.accountIds.length === 0}
              onCheckedChange={() => set({ accountIds: [] })}
            >
              All Accounts
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            {accounts.map((account) => (
              <DropdownMenuCheckboxItem
                key={account.id}
                checked={filters.accountIds.includes(account.id)}
                onCheckedChange={() => toggleAccount(account.id)}
              >
                {account.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Direction pills */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
          {DIRECTION_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => set({ direction: value })}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm transition-colors',
                filters.direction === value
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dimension tabs */}
        <Tabs value={filters.dimension} onValueChange={(v) => set({ dimension: v as AnalyticsDimension })}>
          <TabsList>
            <TabsTrigger value="category">Categories</TabsTrigger>
            <TabsTrigger value="tag">Tags</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Right: view toggle */}
      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => set({ view: 'simple' })}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
            filters.view === 'simple'
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <LayoutGrid className="size-3.5" />
          Simple
        </button>
        <button
          type="button"
          onClick={() => set({ view: 'advanced' })}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
            filters.view === 'advanced'
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <LayoutList className="size-3.5" />
          Advanced
        </button>
      </div>
    </div>
  )
}
