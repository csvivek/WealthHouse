'use client'

import { useEffect, useState } from 'react'
import {
  Banknote,
  Building2,
  Coins,
  CreditCard,
  Landmark,
  Loader2,
  PencilLine,
  PiggyBank,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/empty-state'
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

type AccountFormMode = 'create' | 'edit'

interface AccountFormState {
  institutionName: string
  productName: string
  nickname: string
  identifierHint: string
  currency: string
  accountType: AccountType
  cardName: string
  cardLast4: string
  isActive: boolean
}

const EMPTY_FORM_STATE: AccountFormState = {
  institutionName: '',
  productName: '',
  nickname: '',
  identifierHint: '',
  currency: 'SGD',
  accountType: 'savings',
  cardName: '',
  cardLast4: '',
  isActive: true,
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formMode, setFormMode] = useState<AccountFormMode>('create')
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)
  const [savingAccount, setSavingAccount] = useState(false)
  const [formState, setFormState] = useState<AccountFormState>(EMPTY_FORM_STATE)

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

    setAccounts((data as AccountRow[] | null) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    async function loadAccounts() {
      await fetchAccounts()
    }

    void loadAccounts()
  }, [])

  function updateForm<K extends keyof AccountFormState>(field: K, value: AccountFormState[K]) {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  function resetForm() {
    setFormMode('create')
    setEditingAccountId(null)
    setFormState(EMPTY_FORM_STATE)
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) {
      resetForm()
    }
    setDialogOpen(open)
  }

  function openCreateDialog() {
    resetForm()
    setDialogOpen(true)
  }

  function openEditDialog(account: AccountRow) {
    const primaryCard = account.cards?.[0]

    setFormMode('edit')
    setEditingAccountId(account.id)
    setFormState({
      institutionName: account.institutions?.name ?? '',
      productName: account.product_name,
      nickname: account.nickname ?? '',
      identifierHint: account.identifier_hint ?? '',
      currency: account.currency || 'SGD',
      accountType: account.account_type as AccountType,
      cardName: primaryCard?.card_name ?? account.product_name,
      cardLast4: primaryCard?.card_last4 ?? account.identifier_hint ?? '',
      isActive: account.is_active,
    })
    setDialogOpen(true)
  }

  async function handleSaveAccount() {
    if (!formState.institutionName.trim() || !formState.productName.trim()) {
      toast.error('Institution name and product name are required.')
      return
    }

    if (formMode === 'edit' && !editingAccountId) {
      toast.error('Account could not be loaded for editing.')
      return
    }

    const payload: Record<string, unknown> = {
      institution_name: formState.institutionName.trim(),
      product_name: formState.productName.trim(),
      nickname: formState.nickname.trim() || null,
      identifier_hint: formState.identifierHint.trim() || null,
      currency: formState.currency,
    }

    if (formMode === 'edit') {
      payload.is_active = formState.isActive
    }

    if (formState.accountType === 'credit_card') {
      payload.card_name = formState.cardName.trim() || null
      payload.card_last4 = formState.cardLast4.trim() || null
    }

    setSavingAccount(true)

    try {
      const response = await fetch(
        formMode === 'edit' ? `/api/accounts/${editingAccountId}` : '/api/accounts',
        {
          method: formMode === 'edit' ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        toast.error(data?.error || `Failed to ${formMode === 'edit' ? 'update' : 'add'} account.`)
        return
      }

      toast.success(formMode === 'edit' ? 'Account updated.' : 'Account added.')
      setDialogOpen(false)
      resetForm()
      await fetchAccounts()
    } catch {
      toast.error(`Failed to ${formMode === 'edit' ? 'update' : 'add'} account.`)
    } finally {
      setSavingAccount(false)
    }
  }

  const isEditing = formMode === 'edit'
  const isCreditCard = formState.accountType === 'credit_card'
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
        <Button onClick={openCreateDialog}>
          <Plus />
          Add Account
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Account' : 'Add Account'}</DialogTitle>
            <DialogDescription>
              {isEditing
                ? 'Update account details and status without changing the account type.'
                : 'Create a manual account so you can link uploaded statements.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="institution-name">Institution Name</Label>
              <Input
                id="institution-name"
                value={formState.institutionName}
                onChange={(event) => updateForm('institutionName', event.target.value)}
                placeholder="DBS Bank, OCBC, UOB, Wise..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-name">Product Name</Label>
              <Input
                id="product-name"
                value={formState.productName}
                onChange={(event) => updateForm('productName', event.target.value)}
                placeholder="Multiplier Account, Visa Platinum..."
              />
            </div>

            <div className={cn('grid grid-cols-1 gap-4', isEditing ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
              <div className="space-y-2">
                <Label htmlFor="account-type-display">Account Type</Label>
                {isEditing ? (
                  <Input
                    id="account-type-display"
                    value={typeConfig[formState.accountType]?.label ?? formState.accountType}
                    readOnly
                    aria-readonly="true"
                  />
                ) : (
                  <Select
                    value={formState.accountType}
                    onValueChange={(value) => updateForm('accountType', value as AccountType)}
                  >
                    <SelectTrigger className="w-full" aria-label="Account Type">
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
                )}
              </div>

              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={formState.currency} onValueChange={(value) => updateForm('currency', value)}>
                  <SelectTrigger className="w-full" aria-label="Currency">
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

              {isEditing && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={formState.isActive ? 'active' : 'inactive'}
                    onValueChange={(value) => updateForm('isActive', value === 'active')}
                  >
                    <SelectTrigger className="w-full" aria-label="Status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nickname">Nickname</Label>
                <Input
                  id="nickname"
                  value={formState.nickname}
                  onChange={(event) => updateForm('nickname', event.target.value)}
                  placeholder="Optional display name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="identifier-hint">Identifier Hint</Label>
                <Input
                  id="identifier-hint"
                  value={formState.identifierHint}
                  onChange={(event) => updateForm('identifierHint', event.target.value)}
                  placeholder="Last 4 digits or masked account"
                />
              </div>
            </div>

            {isCreditCard && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="card-name">Card Name</Label>
                  <Input
                    id="card-name"
                    value={formState.cardName}
                    onChange={(event) => updateForm('cardName', event.target.value)}
                    placeholder="Visa Platinum"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="card-last4">Card Last 4</Label>
                  <Input
                    id="card-last4"
                    value={formState.cardLast4}
                    onChange={(event) => updateForm('cardLast4', event.target.value.replace(/[^0-9]/g, ''))}
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
              onClick={() => handleDialogOpenChange(false)}
              disabled={savingAccount}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveAccount} disabled={savingAccount}>
              {savingAccount ? <Loader2 className="animate-spin" /> : isEditing ? <PencilLine /> : <Plus />}
              {isEditing ? 'Save Changes' : 'Save Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account to get started."
          action={{ label: 'Add Account', onClick: openCreateDialog }}
        />
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
                  <div className="flex items-start justify-between gap-3">
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
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className={cn('size-2 rounded-full', account.is_active ? 'bg-green-500' : 'bg-gray-400')} />
                        <span className="text-xs text-muted-foreground">{account.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
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
                  <Button
                    variant="outline"
                    className="mt-4 w-full"
                    onClick={() => openEditDialog(account)}
                  >
                    <PencilLine />
                    Edit
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
