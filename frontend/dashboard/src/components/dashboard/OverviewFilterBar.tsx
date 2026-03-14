'use client'

import { useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { DATE_PERIOD_LABELS, type DatePeriod } from '@/lib/date-periods'
import {
  DEFAULT_OVERVIEW_FILTERS,
  type DashboardFilters,
  type OverviewFilterOption,
} from '@/lib/overview-filters'

export type OverviewFilters = DashboardFilters
export type { OverviewFilterOption }

interface OverviewFilterBarProps {
  filters: OverviewFilters
  accountOptions: OverviewFilterOption[]
  categoryOptions: OverviewFilterOption[]
  groupOptions: OverviewFilterOption[]
  subgroupOptions: OverviewFilterOption[]
  onChange: (filters: OverviewFilters) => void
  onReset: () => void
}

function countActiveFilters(filters: OverviewFilters) {
  return [
    filters.period !== DEFAULT_OVERVIEW_FILTERS.period,
    filters.accountId !== DEFAULT_OVERVIEW_FILTERS.accountId,
    filters.categoryId !== DEFAULT_OVERVIEW_FILTERS.categoryId,
    filters.groupId !== DEFAULT_OVERVIEW_FILTERS.groupId,
    filters.subgroupId !== DEFAULT_OVERVIEW_FILTERS.subgroupId,
  ].filter(Boolean).length
}

export function OverviewFilterBar({
  filters,
  accountOptions,
  categoryOptions,
  groupOptions,
  subgroupOptions,
  onChange,
  onReset,
}: OverviewFilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const activeCount = useMemo(() => countActiveFilters(filters), [filters])

  const updateCategory = (value: string) => {
    onChange({
      ...filters,
      categoryId: value,
      groupId: 'all',
      subgroupId: 'all',
    })
  }

  const controls = (
    <>
      <Select
        value={filters.period}
        onValueChange={(value) =>
          onChange({
            ...filters,
            period: value as DatePeriod,
          })
        }
      >
        <SelectTrigger className="w-full md:w-[160px]">
          <SelectValue placeholder="Period" />
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
        value={filters.accountId}
        onValueChange={(value) => onChange({ ...filters, accountId: value })}
      >
        <SelectTrigger className="w-full md:w-[220px]">
          <SelectValue placeholder="Account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts</SelectItem>
          {accountOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.categoryId} onValueChange={updateCategory}>
        <SelectTrigger className="w-full md:w-[280px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectGroup>
            <SelectLabel>
              Categories
              {(groupOptions.length > 0 || subgroupOptions.length > 0) ? ' by group' : ''}
            </SelectLabel>
            {categoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  )

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {controls}
        <Button type="button" variant="outline" onClick={onReset}>
          Reset
          {activeCount > 0 ? <Badge variant="secondary" className="ml-1">{activeCount}</Badge> : null}
        </Button>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <Button type="button" variant="outline" onClick={() => setMobileOpen(true)}>
          <SlidersHorizontal />
          Filters
          {activeCount > 0 ? <Badge variant="secondary" className="ml-1">{activeCount}</Badge> : null}
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Reset
          {activeCount > 0 ? <Badge variant="secondary" className="ml-1">{activeCount}</Badge> : null}
        </Button>
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Refine the dashboard by period, account, or category.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4">
            {controls}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                onReset()
                setMobileOpen(false)
              }}
            >
              Reset filters
              {activeCount > 0 ? <Badge variant="secondary" className="ml-1">{activeCount}</Badge> : null}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
