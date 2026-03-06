'use client'

import { useState, useEffect } from 'react'
import { Plus, Building2, CreditCard, PiggyBank, TrendingUp, Landmark, Loader2, Coins, Banknote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

const typeConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
  savings: { label: 'Savings', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/40', icon: PiggyBank },
  current: { label: 'Current', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/40', icon: Landmark },
  credit_card: { label: 'Credit Card', color: 'text-red-700 dark:text-red-400', bgColor: 'bg-red-100 dark:bg-red-900/40', icon: CreditCard },
  investment: { label: 'Investment', color: 'text-purple-700 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-900/40', icon: TrendingUp },
  crypto_exchange: { label: 'Crypto Exchange', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/40', icon: Coins },
  loan: { label: 'Loan', color: 'text-amber-700 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/40', icon: Banknote },
  fixed_deposit: { label: 'Fixed Deposit', color: 'text-teal-700 dark:text-teal-400', bgColor: 'bg-teal-100 dark:bg-teal-900/40', icon: PiggyBank },
}

interface AccountRow {
  id: string
  account_type: string
  product_name: string
  nickname: string | null
  identifier_hint: string | null
  currency: string
  is_active: boolean
  institutions: { name: string } | null
  cards: { card_name: string; card_last4: string; total_outstanding: number | null }[] | null
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAccounts() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('household_id')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      const { data } = await supabase
        .from('accounts')
        .select('id, account_type, product_name, nickname, identifier_hint, currency, is_active, institutions(name), cards(card_name, card_last4, total_outstanding)')
        .eq('household_id', profile.household_id)
        .order('created_at', { ascending: false })

      setAccounts((data as AccountRow[]) ?? [])
      setLoading(false)
    }
    fetchAccounts()
  }, [])

  const activeCount = accounts.filter(a => a.is_active).length
  const creditCardCount = accounts.filter(a => a.account_type === 'credit_card').length
  const totalOutstanding = accounts
    .filter(a => a.account_type === 'credit_card')
    .reduce((sum, a) => sum + (a.cards?.[0]?.total_outstanding ?? 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
        <Button>
          <Plus />
          Add Account
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Active Accounts</p>
            <p className="text-2xl font-bold">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Credit Cards</p>
            <p className="text-2xl font-bold">{creditCardCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(totalOutstanding)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {accounts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No accounts linked yet. Add your first account to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => {
            const config = typeConfig[account.account_type]
            const Icon = config?.icon ?? Landmark
            const institutionName = account.institutions?.name ?? 'Manual'
            const card = account.cards?.[0]

            return (
              <Card key={account.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn('rounded-lg p-2', config?.bgColor)}>
                        <Icon className={cn('size-5', config?.color)} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{account.nickname ?? account.product_name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Building2 className="size-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{institutionName}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('size-2 rounded-full', account.is_active ? 'bg-green-500' : 'bg-gray-400')} />
                      {config && (
                        <Badge className={cn(config.bgColor, config.color, 'border-0')}>
                          {config.label}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {account.identifier_hint && (
                    <p className="text-sm text-muted-foreground mb-1">
                      ···· {account.identifier_hint}
                    </p>
                  )}
                  {card && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">{card.card_name} ···· {card.card_last4}</p>
                      {card.total_outstanding != null && (
                        <p className="text-xl font-bold">{formatCurrency(card.total_outstanding)}</p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">{account.currency}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
