import { formatCurrency, formatDate } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { BreakdownTransaction } from '@/hooks/useBreakdownTransactions'

interface TransactionDrilldownTableProps {
  transactions: BreakdownTransaction[]
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (nextPage: number) => void
}

export function TransactionDrilldownTable({
  transactions,
  page,
  pageSize,
  totalCount,
  onPageChange,
}: TransactionDrilldownTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Merchant / Description</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Subgroup</TableHead>
            <TableHead>Group</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                No transactions found for this drilldown.
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((txn) => (
              <TableRow key={txn.id}>
                <TableCell>{formatDate(txn.txn_date)}</TableCell>
                <TableCell>{txn.merchant ?? txn.description ?? '-'}</TableCell>
                <TableCell>{txn.account ?? '-'}</TableCell>
                <TableCell>{txn.category ?? '-'}</TableCell>
                <TableCell>{txn.subgroup ?? '-'}</TableCell>
                <TableCell>{txn.group ?? '-'}</TableCell>
                <TableCell className="text-right">{formatCurrency(txn.amount ?? 0)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
