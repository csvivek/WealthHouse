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
import { CategoryBadge } from '@/components/category-badge'

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
  category: CategoryWithHierarchy | null
}

interface CategoryWithHierarchy {
  id: number
  name: string
  group_id: number | null
  subgroup_id: number | null
  icon_key: string | null
  color_token: string | null
  color_hex: string | null
  domain_type: string | null
  payment_subtype: string | null
  category_group: { id: number; name: string } | null
  category_subgroup: { id: number; name: string; group_id: number } | null
}

interface AccountInfo {
  id: string
  product_name: string
  nickname: string | null
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<StatementTxn[]>([])
  const [categories, setCategories] = useState<CategoryWithHierarchy[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [subgroupFilter, setSubgroupFilter] = useState('all')
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
          .select('id, txn_date, amount, txn_type, merchant_normalized, merchant_raw, description, category_id, account_id, confidence, category:categories(id, name, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id))')
          .in('account_id', accountIds)
          .order('txn_date', { ascending: false }),
        supabase.from('categories').select('id, name, group_id, subgroup_id, icon_key, color_token, color_hex, domain_type, payment_subtype, category_group:category_groups(id, name), category_subgroup:category_subgroups(id, name, group_id)'),
      ])

      setTransactions((txnRes.data as unknown as StatementTxn[]) ?? [])
      setCategories((catRes.data as unknown as CategoryWithHierarchy[]) ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const categoryMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories])
  const groupOptions = useMemo(() => {
    const byId = new Map<number, string>()
    for (const category of categories) {
      const group = category.category_group
      if (group) byId.set(group.id, group.name)
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [categories])

  const subgroupOptions = useMemo(() => {
    const byId = new Map<number, { name: string; group_id: number }>()
    for (const category of categories) {
      const subgroup = category.category_subgroup
      if (!subgroup) continue
      if (groupFilter !== 'all' && String(subgroup.group_id) !== groupFilter) continue
      byId.set(subgroup.id, { name: subgroup.name, group_id: subgroup.group_id })
    }
    return Array.from(byId.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [categories, groupFilter])

  const categoryOptions = useMemo(() => {
    return categories
      .filter((category) => {
        if (groupFilter !== 'all' && String(category.group_id) !== groupFilter) return false
        if (subgroupFilter !== 'all' && String(category.subgroup_id) !== subgroupFilter) return false
        return true
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [categories, groupFilter, subgroupFilter])
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
        const txnCategory = t.category
        if (groupFilter !== 'all' && String(txnCategory?.group_id ?? '') !== groupFilter) return false
        if (subgroupFilter !== 'all' && String(txnCategory?.subgroup_id ?? '') !== subgroupFilter) return false
        if (categoryFilter !== 'all' && String(txnCategory?.id ?? '') !== categoryFilter) return false
        if (accountFilter !== 'all' && t.account_id !== accountFilter) return false
        if (t.txn_date < rangeStart || t.txn_date > rangeEnd) return false
        return true
      })
      .sort((a, b) => b.txn_date.localeCompare(a.txn_date))
  }, [transactions, search, groupFilter, subgroupFilter, categoryFilter, accountFilter, dateRange])

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
        <Select
          value={groupFilter}
          onValueChange={(value) => {
            setGroupFilter(value)
            setSubgroupFilter('all')
            setCategoryFilter('all')
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groupOptions.map(([groupId, groupName]) => (
              <SelectItem key={groupId} value={String(groupId)}>
                {groupName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subgroupFilter}
          onValueChange={(value) => {
            setSubgroupFilter(value)
            setCategoryFilter('all')
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Subgroup" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subgroups</SelectItem>
            {subgroupOptions.map(([subgroupId, subgroup]) => (
              <SelectItem key={subgroupId} value={String(subgroupId)}>
                {subgroup.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryOptions.map(cat => (
              <SelectItem key={cat.id} value={String(cat.id)}>
                {cat.name}
              </SelectItem>
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
                  const category = txn.category ?? (txn.category_id != null ? categoryMap[txn.category_id] : undefined)
                  const account = accountMap[txn.account_id]
                  const isCredit = txn.txn_type === 'credit'
                  const merchantName = txn.merchant_normalized ?? txn.merchant_raw ?? txn.description ?? 'Unknown'

                  return (
                    <tr key={txn.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatDate(txn.txn_date)}
                      </td>
                      <td className="py-3 pr-4 font-medium">{merchantName}</td>
                      <td className="py-3 pr-4">
                        {category ? <CategoryBadge {...category} /> : '—'}
                      </td>
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
