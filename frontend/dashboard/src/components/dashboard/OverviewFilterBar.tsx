'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DATE_PERIOD_LABELS, DatePeriod } from '@/lib/date-periods'

export interface OverviewFilterOption {
  value: string
  label: string
}

export interface OverviewFilters {
  period: DatePeriod
  accountId: string
  categoryId: string
  groupId: string
  subgroupId: string
}

interface OverviewFilterBarProps {
  filters: OverviewFilters
  accountOptions: OverviewFilterOption[]
  categoryOptions: OverviewFilterOption[]
  groupOptions: OverviewFilterOption[]
  subgroupOptions: OverviewFilterOption[]
  onChange: (filters: OverviewFilters) => void
  onReset: () => void
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.period} onValueChange={(value) => onChange({ ...filters, period: value as DatePeriod })}>
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Period" /></SelectTrigger>
        <SelectContent>
          {Object.entries(DATE_PERIOD_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.accountId} onValueChange={(value) => onChange({ ...filters, accountId: value })}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Account" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Accounts</SelectItem>
          {accountOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.categoryId} onValueChange={(value) => onChange({ ...filters, categoryId: value })}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          {categoryOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.groupId} onValueChange={(value) => onChange({ ...filters, groupId: value, subgroupId: 'all' })}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Group" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Groups</SelectItem>
          {groupOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.subgroupId} onValueChange={(value) => onChange({ ...filters, subgroupId: value })}>
        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Subgroup" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Subgroups</SelectItem>
          {subgroupOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button type="button" variant="outline" onClick={onReset}>Reset</Button>
    </div>
  )
}
