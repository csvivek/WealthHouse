'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, Clock, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

function getDaysAgo(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().split('T')[0]
}

function getDateRangeStart(range: string) {
  const now = new Date()
  switch (range) {
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    case 'last_month':
      return new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
    case '90_days':
      return getDaysAgo(90)
    default:
      return getDaysAgo(90)
  }
}

function getDateRangeEnd(range: string) {
  if (range === 'last_month') {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
  }
  return new Date().toISOString().split('T')[0]
}

interface StatementTxn {
  id: string
  txn_date: string
  amount: number
  txn_type: string
  merchant_normalized: string | null
  merchant_raw: string | null
  description: string | null
  category_id: number | null
  account_id: string
  confidence: number
}

interface Category {
  id: number
  name: string
  group_name: string | null
}

interface AccountInfo {
  id: string
  product_name: string
  nickname: string | null
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<StatementTxn[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [dateRange, setDateRange] = useState('90_days')

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const { data: accts } = await supabase
        .from('accounts')
        .select('id, product_name, nickname')
        .eq('household_id', profile.household_id)

      const accountList = accts ?? []
      setAccounts(accountList)
      const accountIds = accountList.map(a => a.id)

      if (accountIds.length === 0) { setLoading(false); return }

      const [txnRes, catRes] = await Promise.all([
        supabase
          .from('statement_transactions')
          .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, description, category_id, account_id, confidence')
          .in('account_id', accountIds)
          .order('txn_date', { ascending: false }),
        supabase.from('categories').select('id, name, group_name, icon_key, color_token, color_hex, display_order, is_active, is_archived, is_system'),
      ])

      setTransactions((txnRes.data as StatementTxn[]) ?? [])
      setCategories((catRes.data as Category[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map(c => [c.id, c])),
    [categories]
  )
  const accountMap = useMemo(
    () => Object.fromEntries(accounts.map(a => [a.id, a])),
    [accounts]
  )

  const filtered = useMemo(() => {
    const rangeStart = getDateRangeStart(dateRange)
    const rangeEnd = getDateRangeEnd(dateRange)

    return [...transactions]
      .filter(t => {
        const merchant = t.merchant_normalized ?? t.merchant_raw ?? t.description ?? ''
        if (search && !merchant.toLowerCase().includes(search.toLowerCase())) return false
        if (categoryFilter !== 'all' && String(t.category_id) !== categoryFilter) return false
        if (accountFilter !== 'all' && t.account_id !== accountFilter) return false
        if (t.txn_date < rangeStart || t.txn_date > rangeEnd) return false
        return true
      })
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
  }, [transactions, search, categoryFilter, accountFilter, dateRange])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by merchant..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map(acc => (
              <SelectItem key={acc.id} value={acc.id}>{acc.nickname ?? acc.product_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="90_days">Last 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-3 pr-4 font-medium">Date</th>
                  <th className="pb-3 pr-4 font-medium">Merchant</th>
                  <th className="pb-3 pr-4 font-medium">Category</th>
                  <th className="pb-3 pr-4 font-medium">Account</th>
                  <th className="pb-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(txn => {
                  const category = txn.category_id != null ? categoryMap[txn.category_id] : undefined
                  const account = accountMap[txn.account_id]
                  const isCredit = txn.txn_type === 'credit'
                  const merchantName = txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? 'Unknown'

                  return (
                    <tr key={txn.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatDate(txn.txn_date)}
                      </td>
                      <td className="py-3 pr-4 font-medium">{merchantName}</td>
                      <td className="py-3 pr-4">{category?.name ?? '—'}</td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {account?.nickname ?? account?.product_name ?? '—'}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {txn.confidence > 0 && txn.confidence < 0.9 && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Clock className="size-3" />
                              Low conf
                            </Badge>
                          )}
                          <span
                            className={cn(
                              'font-medium',
                              isCredit
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                            )}
                          >
                            {isCredit ? '+' : '-'}{formatCurrency(Math.abs(txn.amount))}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
