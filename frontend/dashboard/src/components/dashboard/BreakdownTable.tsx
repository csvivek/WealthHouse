import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/format'
import type { BreakdownRowDto } from '@/lib/dashboard-mappers'

interface BreakdownTableProps {
  rows: BreakdownRowDto[]
  currency?: string
}

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

export function BreakdownTable({ rows, currency = 'SGD' }: BreakdownTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No breakdown data available.
      </p>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Transaction Count</TableHead>
          <TableHead className="text-right">Total Value</TableHead>
          <TableHead className="text-right">Share of Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right">{row.transactionCount}</TableCell>
            <TableCell className="text-right">{formatCurrency(row.totalValue, currency)}</TableCell>
            <TableCell className="text-right">{formatShare(row.shareOfTotal)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
