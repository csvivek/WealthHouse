'use client'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type OverviewTabValue = 'payments' | 'receipts'

interface OverviewTabsProps {
  value: OverviewTabValue
  onValueChange: (value: OverviewTabValue) => void
}

export function OverviewTabs({ value, onValueChange }: OverviewTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as OverviewTabValue)}>
      <TabsList>
        <TabsTrigger value="payments">Payments</TabsTrigger>
        <TabsTrigger value="receipts">Receipts</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}
