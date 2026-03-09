'use client'

import { useState, useEffect } from 'react'
import {
  Plus,
  Building2,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Landmark,
  Loader2,
  Coins,
  Banknote,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

type AccountType =
  | 'savings'
  | 'current'
  | 'credit_card'
  | 'investment'
  | 'crypto_exchange'
  | 'loan'
  | 'fixed_deposit'

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [savingAccount, setSavingAccount] = useState(false)
  const [institutionName, setInstitutionName] = useState('')
  const [productName, setProductName] = useState('')
  const [nickname, setNickname] = useState('')
  const [identifierHint, setIdentifierHint] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [accountType, setAccountType] = useState<AccountType>('savings')
  const [cardName, setCardName] = useState('')
  const [cardLast4, setCardLast4] = useState('')

  async function fetchAccounts() {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setAccounts([])
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setAccounts([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('accounts')
      .select('id, account_type, product_name, nickname, identifier_hint, currency, is_active, institutions(name), cards(card_name, card_last4, total_outstanding)')
      .eq('household_id', profile.household_id)
      .order('created_at', { ascending: false })

    setAccounts((data as unknown as AccountRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function loadAccounts() {
      await fetchAccounts()
    }

    void loadAccounts()
  }, [])

  function resetForm() {
    setInstitutionName('')
    setProductName('')
    setNickname('')
    setIdentifierHint('')
    setCurrency('SGD')
    setAccountType('savings')
    setCardName('')
    setCardLast4('')
  }

  async function handleCreateAccount() {
    if (!institutionName.trim() || !productName.trim()) {
      toast.error('Institution name and product name are required.')
      return
    }

    setSavingAccount(true)

    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_name: institutionName.trim(),
          product_name: productName.trim(),
          nickname: nickname.trim() || null,
          identifier_hint: identifierHint.trim() || null,
          currency,
          account_type: accountType,
          card_name: accountType === 'credit_card' ? cardName.trim() || null : null,
          card_last4: accountType === 'credit_card' ? cardLast4.trim() || null : null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        toast.error(data.error || 'Failed to add account.')
        return
      }

      toast.success('Account added.')
      setDialogOpen(false)
      resetForm()
      await fetchAccounts()
    } catch {
      toast.error('Failed to add account.')
    } finally {
      setSavingAccount(false)
    }
  }

  const activeCount = accounts.filter((account) => account.is_active).length
  const creditCardCount = accounts.filter((account) => account.account_type === 'credit_card').length
  const totalOutstanding = accounts
    .filter((account) => account.account_type === 'credit_card')
    .reduce((sum, account) => sum + (account.cards?.[0]?.total_outstanding ?? 0), 0)

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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus />
              Add Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Account</DialogTitle>
              <DialogDescription>
                Create a manual account so you can link uploaded statements.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="institution-name">Institution Name</Label>
                <Input
                  id="institution-name"
                  value={institutionName}
                  onChange={(event) => setInstitutionName(event.target.value)}
                  placeholder="DBS Bank, OCBC, UOB, Wise..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="product-name">Product Name</Label>
                <Input
                  id="product-name"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="Multiplier Account, Visa Platinum..."
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Account Type</Label>
                  <Select
                    value={accountType}
                    onValueChange={(value) => setAccountType(value as AccountType)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="savings">Savings</SelectItem>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="credit_card">Credit Card</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                      <SelectItem value="crypto_exchange">Crypto Exchange</SelectItem>
                      <SelectItem value="loan">Loan</SelectItem>
                      <SelectItem value="fixed_deposit">Fixed Deposit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SGD">SGD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="INR">INR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nickname">Nickname</Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    placeholder="Optional display name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="identifier-hint">Identifier Hint</Label>
                  <Input
                    id="identifier-hint"
                    value={identifierHint}
                    onChange={(event) => setIdentifierHint(event.target.value)}
                    placeholder="Last 4 digits or masked account"
                  />
                </div>
              </div>

              {accountType === 'credit_card' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="card-name">Card Name</Label>
                    <Input
                      id="card-name"
                      value={cardName}
                      onChange={(event) => setCardName(event.target.value)}
                      placeholder="Visa Platinum"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="card-last4">Card Last 4</Label>
                    <Input
                      id="card-last4"
                      value={cardLast4}
                      onChange={(event) => setCardLast4(event.target.value.replace(/[^0-9]/g, ''))}
                      maxLength={4}
                      placeholder="1234"
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDialogOpen(false)
                  resetForm()
                }}
                disabled={savingAccount}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateAccount} disabled={savingAccount}>
                {savingAccount ? <Loader2 className="animate-spin" /> : <Plus />}
                Save Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
            const institutionNameLabel = account.institutions?.name ?? 'Manual'
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
                        <div className="mt-1 flex items-center gap-2">
                          <Building2 className="size-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{institutionNameLabel}</span>
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
                    <p className="mb-1 text-sm text-muted-foreground">
                      .... {account.identifier_hint}
                    </p>
                  )}
                  {card && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">{card.card_name} .... {card.card_last4}</p>
                      {card.total_outstanding != null && (
                        <p className="text-xl font-bold">{formatCurrency(card.total_outstanding)}</p>
                      )}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">{account.currency}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
