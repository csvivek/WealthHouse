'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Trash2, ChevronLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ImportRecord {
  id: string
  account_id: string
  statement_name: string
  parse_status: string
  parse_confidence: number
  created_at: string
  parsed_data?: {
    institution_code?: string
    period_start?: string
    period_end?: string
    summary?: string
    transactions?: Array<{
      date?: string
      description?: string
      amount?: number
      type?: string
    }>
  }
}

interface AccountInfo {
  id: string
  product_name: string
  nickname: string | null
}

interface Transaction {
  id: string
  date?: string
  description?: string
  amount?: number
  type?: string
}

export default function StatementReviewPage({ params }: { params: { importId: string } }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [importRecord, setImportRecord] = useState<ImportRecord | null>(null)
  const [account, setAccount] = useState<AccountInfo | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function loadData() {
      const supabase = createClient()

      // Fetch import record
      const { data: imp } = await supabase
        .from('statement_imports')
        .select('*')
        .eq('id', params.importId)
        .single()

      if (!imp) {
        router.push('/dashboard/statements')
        return
      }

      setImportRecord(imp as ImportRecord)

      // Fetch account info
      const { data: acc } = await supabase
        .from('accounts')
        .select('id, product_name, nickname')
        .eq('id', imp.account_id)
        .single()

      setAccount(acc as AccountInfo)

      // Load transactions from parsed_data
      if ((imp as any).parsed_data?.transactions) {
        const parsed = (imp as any).parsed_data.transactions
        const txns: Transaction[] = parsed.map((p: any, idx: number) => ({
          id: `parsed_${idx}`,
          date: p.date,
          description: p.description,
          amount: p.amount,
          type: p.type,
        }))
        setTransactions(txns)
      }

      setLoading(false)
    }

    loadData()
  }, [params.importId, router])

  const handleToggleTransaction = (txnId: string) => {
    setSelectedTransactionIds(prev => {
      const next = new Set(prev)
      if (next.has(txnId)) {
        next.delete(txnId)
      } else {
        next.add(txnId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedTransactionIds.size === transactions.length) {
      setSelectedTransactionIds(new Set())
    } else {
      setSelectedTransactionIds(new Set(transactions.map(t => t.id)))
    }
  }

  const handleRejectSelected = async () => {
    if (!importRecord) return
    const supabase = createClient()

    // Update parsed_data to remove selected transactions
    const updatedTransactions = transactions
      .filter(t => !selectedTransactionIds.has(t.id))
      .map(t => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        type: t.type,
      }))

    const updated = {
      ...(importRecord as any).parsed_data,
      transactions: updatedTransactions,
    }

    await supabase
      .from('statement_imports')
      .update({ parsed_data: updated })
      .eq('id', params.importId)

    setTransactions(prev => prev.filter(t => !selectedTransactionIds.has(t.id)))
    setSelectedTransactionIds(new Set())
  }

  const handleRejectAll = async () => {
    if (!importRecord) return
    const supabase = createClient()

    await supabase
      .from('statement_imports')
      .update({
        parse_status: 'rejected',
        parsed_data: { transactions: [] },
      })
      .eq('id', params.importId)

    router.push('/dashboard/statements')
  }

  const handleApprove = async () => {
    if (!importRecord) return
    setUploading(true)

    try {
      const res = await fetch('/api/statements/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ import_id: params.importId }),
      })

      if (!res.ok) {
        console.error('Approval failed:', await res.text())
        setUploading(false)
        return
      }

      router.push('/dashboard/statements')
    } catch (err) {
      console.error('Approval error:', err)
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!importRecord) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Import record not found</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4 border-b pb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{importRecord.statement_name}</h1>
          <p className="text-sm text-muted-foreground">
            {account?.nickname ?? account?.product_name ?? 'Unknown Account'}
            {' '} • {formatDate(importRecord.created_at)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Parsed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Selected to Reject
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {selectedTransactionIds.size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Will Be Imported
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {transactions.length - selectedTransactionIds.size}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Transactions</CardTitle>
            <div className="text-sm text-muted-foreground">
              {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions parsed from this statement.
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted">
                    <th className="px-4 py-3 text-left w-12">
                      <input
                        type="checkbox"
                        checked={
                          selectedTransactionIds.size === transactions.length &&
                          transactions.length > 0
                        }
                        onChange={handleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Description</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr
                      key={txn.id}
                      className={cn(
                        'border-b last:border-0 hover:bg-muted/50 transition-colors',
                        selectedTransactionIds.has(txn.id) && 'bg-muted/70'
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedTransactionIds.has(txn.id)}
                          onChange={() => handleToggleTransaction(txn.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3">{txn.date ? formatDate(txn.date) : '—'}</td>
                      <td className="px-4 py-3 max-w-xs truncate">{txn.description || '—'}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {(txn.amount ?? 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={txn.type === 'debit' ? 'destructive' : 'default'}
                        >
                          {txn.type}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end border-t pt-4">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        {selectedTransactionIds.size > 0 && (
          <Button
            variant="outline"
            onClick={handleRejectSelected}
          >
            <Trash2 className="size-4 mr-2" />
            Reject Selected ({selectedTransactionIds.size})
          </Button>
        )}
        <Button
          variant="destructive"
          onClick={handleRejectAll}
        >
          Reject All
        </Button>
        <Button
          onClick={handleApprove}
          disabled={uploading || transactions.length === 0}
        >
          <Check className="size-4 mr-2" />
          {uploading ? 'Approving…' : `Approve & Import (${transactions.length})`}
        </Button>
      </div>
    </div>
  )
}
