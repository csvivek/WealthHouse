'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileUp,
  Loader2,
  FileText,
  ExternalLink,
  Pencil,
  AlertTriangle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { useStatementCommitJobs } from '@/lib/statement-commit-jobs'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'

interface AccountOption {
  id: string
  product_name: string
  nickname: string | null
  account_type: string
  institutions: { name: string } | null
}

interface FileImportRow {
  id: string
  file_name: string
  uploaded_by: string
  uploadedByDisplayName: string | null
  uploadedByEmail: string | null
  institution_code: string | null
  raw_parse_result: {
    institution_name?: string | null
    matched_accounts?: Array<{
      label?: string | null
    }>
    account?: {
      account_type?: string | null
    } | null
  } | null
  status: string
  total_rows: number | null
  approved_rows: number | null
  rejected_rows: number | null
  duplicate_rows: number | null
  committed_rows: number | null
  statement_period_start: string | null
  statement_period_end: string | null
  created_at: string
}

interface HouseholdUploaderProfile {
  id: string
  display_name: string | null
  email?: string | null
}

interface SuggestedExistingAccount {
  accountId: string
  label: string
}

interface UnmatchedAccountDescriptor {
  descriptorKey: string
  label: string
  transactionCount: number
  sampleRowIndexes: number[]
  institution_name: string | null
  institution_code: string | null
  account_type: string | null
  product_name: string | null
  identifier_hint: string | null
  card_name: string | null
  card_last4: string | null
  currency: string | null
  suggestedExistingAccountId: string | null
  suggestedExistingAccountLabel: string | null
  suggestedScore: number | null
}

interface ParseRecoveryState {
  parseSessionId: string
  error: string
  unmatchedAccountDescriptors: UnmatchedAccountDescriptor[]
  suggestedExistingAccounts: SuggestedExistingAccount[]
}

type ResolutionMode = 'existing' | 'create'

interface DescriptorResolutionState {
  mode: ResolutionMode
  existingAccountId: string
  createAccount: {
    institution_name: string
    institution_code: string
    product_name: string
    account_type: string
    identifier_hint: string
    currency: string
    nickname: string
    card_name: string
    card_last4: string
  }
}

function getStatementStatusBadge(status: string) {
  switch (status) {
    case 'committed':
      return <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800">Committed</Badge>
    case 'pending':
    case 'processing':
    case 'parsing':
    case 'committing':
    case 'received':
      return <Badge variant="outline" className="border-amber-300 text-amber-700">Processing</Badge>
    case 'requires_review':
    case 'in_review':
      return <Badge variant="outline" className="border-orange-300 text-orange-700">Needs Review</Badge>
    case 'failed':
    case 'error':
      return <Badge variant="destructive">Failed</Badge>
    case 'duplicate':
      return <Badge variant="outline" className="border-orange-300 text-orange-700">Duplicate</Badge>
    case 'rejected':
      return <Badge variant="secondary">Rejected</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function StatementsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [imports, setImports] = useState<FileImportRow[]>([])
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUploaderProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [uploaderFilter, setUploaderFilter] = useState<string>('all')

  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [resolvingRecovery, setResolvingRecovery] = useState(false)
  const [parseRecovery, setParseRecovery] = useState<ParseRecoveryState | null>(null)
  const [descriptorResolutions, setDescriptorResolutions] = useState<Record<string, DescriptorResolutionState>>({})

  const { hasActiveJobs } = useStatementCommitJobs()
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }
    setCurrentUserId(user.id)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setLoading(false)
      return
    }

    const [acctRes, importRes, householdProfilesResponse] = await Promise.all([
      supabase
        .from('accounts')
        .select('id, product_name, nickname, account_type, institutions(name)')
        .eq('household_id', profile.household_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('file_imports')
        .select('id, file_name, uploaded_by, institution_code, raw_parse_result, status, total_rows, approved_rows, rejected_rows, duplicate_rows, committed_rows, statement_period_start, statement_period_end, created_at')
        .eq('household_id', profile.household_id)
        .order('created_at', { ascending: false })
        .limit(50),
      fetch('/api/household/profiles'),
    ])

    const householdProfilesPayload = householdProfilesResponse.ok
      ? await householdProfilesResponse.json().catch(() => ({ profiles: [] }))
      : { profiles: [] }
    const householdProfiles = (householdProfilesPayload.profiles ?? []) as HouseholdUploaderProfile[]
    const uploadersById = new Map(
      householdProfiles.map((householdProfile) => [householdProfile.id, householdProfile]),
    )
    const importRows = ((importRes.data as Array<Omit<FileImportRow, 'uploadedByDisplayName' | 'uploadedByEmail'>> | null) ?? [])
      .map((importRow) => {
        const uploader = uploadersById.get(importRow.uploaded_by)
        return {
          ...importRow,
          uploadedByDisplayName: uploader?.display_name ?? null,
          uploadedByEmail: uploader?.email ?? null,
        }
      })

    setAccounts((acctRes.data as unknown as AccountOption[]) ?? [])
    setHouseholdUsers(householdProfiles)
    setImports(importRows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!hasActiveJobs) return

    void fetchData()
    const interval = window.setInterval(() => {
      void fetchData()
    }, 3000)

    return () => window.clearInterval(interval)
  }, [hasActiveJobs, fetchData])

  function getAccountLabel(option: AccountOption) {
    return `${option.institutions?.name ? `${option.institutions.name} — ` : ''}${option.nickname ?? option.product_name}`
  }

  const uploaderOptions = useMemo(
    () => householdUsers.filter((householdUser) => householdUser.id !== currentUserId),
    [currentUserId, householdUsers],
  )

  const filteredImports = useMemo(() => {
    if (uploaderFilter === 'all') return imports
    if (uploaderFilter === 'me') {
      return imports.filter((importRow) => importRow.uploaded_by === currentUserId)
    }
    return imports.filter((importRow) => importRow.uploaded_by === uploaderFilter)
  }, [currentUserId, imports, uploaderFilter])

  function getUploaderName(importRow: FileImportRow) {
    if (importRow.uploaded_by === currentUserId) return 'You'
    return importRow.uploadedByDisplayName || importRow.uploadedByEmail || 'Unknown user'
  }

  function getImportInstitutionLabel(importRow: FileImportRow) {
    return importRow.raw_parse_result?.institution_name || importRow.institution_code || '—'
  }

  function getImportMatchedAccountLabel(importRow: FileImportRow) {
    return importRow.raw_parse_result?.matched_accounts?.find((entry) => entry?.label)?.label || null
  }

  function getImportParsedAccountType(importRow: FileImportRow) {
    return importRow.raw_parse_result?.account?.account_type || null
  }

  function initializeRecoveryState(payload: ParseRecoveryState) {
    setParseRecovery(payload)

    const next: Record<string, DescriptorResolutionState> = {}
    for (const descriptor of payload.unmatchedAccountDescriptors ?? []) {
      const defaultMode: ResolutionMode = descriptor.suggestedExistingAccountId ? 'existing' : 'create'
      next[descriptor.descriptorKey] = {
        mode: defaultMode,
        existingAccountId: descriptor.suggestedExistingAccountId || '',
        createAccount: {
          institution_name: descriptor.institution_name || '',
          institution_code: descriptor.institution_code || '',
          product_name: descriptor.card_name || descriptor.product_name || '',
          account_type: descriptor.account_type || 'savings',
          identifier_hint: descriptor.identifier_hint || descriptor.card_last4 || '',
          currency: descriptor.currency || 'SGD',
          nickname: '',
          card_name: descriptor.card_name || descriptor.product_name || '',
          card_last4: descriptor.card_last4 || '',
        },
      }
    }

    setDescriptorResolutions(next)
  }

  function updateDescriptorResolution(descriptorKey: string, updater: (current: DescriptorResolutionState) => DescriptorResolutionState) {
    setDescriptorResolutions((current) => {
      const existing = current[descriptorKey]
      if (!existing) return current
      return {
        ...current,
        [descriptorKey]: updater(existing),
      }
    })
  }

  async function handleUpload(file: File) {
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('statement', file)
      if (selectedAccountId) {
        formData.append('account_id', selectedAccountId)
      }

      const res = await fetch('/api/ai/statement', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(`This file has already been processed: ${data.existingFileName}`)
          if (data.existingStatus === 'in_review') {
            router.push(`/statements/review/${data.existingImportId}`)
          }
          return
        }

        if (res.status === 422 && data?.code === 'transaction_account_match_required' && data?.parseSessionId) {
          initializeRecoveryState({
            parseSessionId: data.parseSessionId,
            error: data.error || 'Account matching needs your review before import can continue.',
            unmatchedAccountDescriptors: (data.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
            suggestedExistingAccounts: (data.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
          })
          toast.error('Account matching needs your review. Continue import below without re-uploading.')
          return
        }

        toast.error(data.error || 'Failed to parse statement')
        return
      }

      setParseRecovery(null)
      setDescriptorResolutions({})

      const importMessage = data.importLabel
        ? `Parsed ${data.transactionsCount} transactions and linked to ${data.importLabel}. Imported successfully.`
        : `Parsed ${data.transactionsCount} transactions. Imported successfully.`

      toast.success(importMessage)
      router.push(data.reviewUrl)
    } catch {
      toast.error('Failed to upload statement')
    } finally {
      setUploading(false)
    }
  }

  async function handleContinueRecoveryImport() {
    if (!parseRecovery) return

    const resolutions = [] as Array<Record<string, unknown>>

    for (const descriptor of parseRecovery.unmatchedAccountDescriptors) {
      const state = descriptorResolutions[descriptor.descriptorKey]
      if (!state) {
        toast.error('Missing resolution state for one or more unmatched descriptors.')
        return
      }

      if (state.mode === 'existing') {
        if (!state.existingAccountId) {
          toast.error(`Select an existing account for: ${descriptor.label}`)
          return
        }

        resolutions.push({
          descriptorKey: descriptor.descriptorKey,
          existingAccountId: state.existingAccountId,
        })
        continue
      }

      const create = state.createAccount
      if (!create.institution_name.trim() || !create.product_name.trim()) {
        toast.error(`Institution and product name are required for: ${descriptor.label}`)
        return
      }

      resolutions.push({
        descriptorKey: descriptor.descriptorKey,
        createAccount: {
          institution_name: create.institution_name.trim(),
          institution_code: create.institution_code.trim() || null,
          product_name: create.product_name.trim(),
          account_type: create.account_type,
          identifier_hint: create.identifier_hint.trim() || null,
          currency: create.currency,
          nickname: create.nickname.trim() || null,
          card_name: create.card_name.trim() || null,
          card_last4: create.card_last4.trim() || null,
        },
      })
    }

    setResolvingRecovery(true)
    try {
      const res = await fetch('/api/ai/statement/resolve-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parseSessionId: parseRecovery.parseSessionId,
          resolutions,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (res.status === 422 && data?.code === 'transaction_account_match_required' && data?.parseSessionId) {
          initializeRecoveryState({
            parseSessionId: data.parseSessionId,
            error: data.error || 'Some transactions still need account resolution.',
            unmatchedAccountDescriptors: (data.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
            suggestedExistingAccounts: (data.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
          })
          toast.error('Some transactions still need account resolution. Please review and continue.')
          return
        }

        toast.error(data.error || 'Failed to continue import')
        return
      }

      setParseRecovery(null)
      setDescriptorResolutions({})
      toast.success(`Import continued. Parsed ${data.transactionsCount} transactions.`)
      router.push(data.reviewUrl)
    } catch {
      toast.error('Failed to continue import')
    } finally {
      setResolvingRecovery(false)
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) void handleUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) void handleUpload(file)
  }

  async function handleReopenImport(importId: string) {
    try {
      const res = await fetch(`/api/ai/statement/${importId}/reopen`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to reopen import')
        return
      }

      toast.success('Import reopened for editing')
      await fetchData()
      router.push(`/statements/review/${importId}`)
    } catch {
      toast.error('Failed to reopen import')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statements</h1>
        <p className="text-muted-foreground">
          Upload bank and credit card statements to import transactions.
        </p>
      </div>

      <Card id="statement-upload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Import Statement
          </CardTitle>
          <CardDescription>
            Account selection is optional. If you leave it blank, the parser will try to match the statement to one of your existing accounts automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Link to Account</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue placeholder="Auto-detect from statement (recommended)" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {getAccountLabel(account)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Leave blank to auto-match after parsing. Choose an account only if you want to override the detected match.
                </span>
                {selectedAccountId && (
                  <Button variant="ghost" size="sm" className="h-auto px-0 py-0 text-xs" onClick={() => setSelectedAccountId('')}>
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50',
              uploading && 'pointer-events-none opacity-60',
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.zip,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
            {uploading ? (
              <>
                <Loader2 className="mb-3 size-10 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium">Parsing statement…</p>
                <p className="text-xs text-muted-foreground">This may take 10–30 seconds</p>
              </>
            ) : (
              <>
                <FileUp className="mb-3 size-10 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Drop your statement here or click to browse
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Supports PDF, JPEG, PNG, ZIP, TXT
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {parseRecovery && (
        <Card className="border-amber-300/60 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600" />
              Account Matching Needs Review
            </CardTitle>
            <CardDescription className="text-amber-900 dark:text-amber-100">
              {parseRecovery.error}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-amber-900/80 dark:text-amber-100/80">
              Continue import from this parsed session without re-uploading the statement.
            </p>

            <div className="space-y-4">
              {parseRecovery.unmatchedAccountDescriptors.map((descriptor) => {
                const resolution = descriptorResolutions[descriptor.descriptorKey]
                if (!resolution) return null

                return (
                  <div key={descriptor.descriptorKey} className="rounded-md border bg-background p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{descriptor.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {descriptor.transactionCount} transaction(s) need this account mapping.
                        </p>
                      </div>
                      {descriptor.suggestedExistingAccountLabel && (
                        <Badge variant="outline">Suggested: {descriptor.suggestedExistingAccountLabel}</Badge>
                      )}
                    </div>

                    <div className="mb-3 w-full max-w-xs space-y-2">
                      <Label>Resolution Mode</Label>
                      <Select
                        value={resolution.mode}
                        onValueChange={(value) => {
                          updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                            ...current,
                            mode: value as ResolutionMode,
                          }))
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="existing">Use Existing Account</SelectItem>
                          <SelectItem value="create">Create Account (Prefilled)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {resolution.mode === 'existing' ? (
                      <div className="w-full max-w-xl space-y-2">
                        <Label>Existing Account</Label>
                        <Select
                          value={resolution.existingAccountId}
                          onValueChange={(value) => {
                            updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              existingAccountId: value,
                            }))
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={account.id}>
                                {getAccountLabel(account)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Institution Name</Label>
                          <Input
                            value={resolution.createAccount.institution_name}
                            onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                institution_name: event.target.value,
                              },
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Product Name</Label>
                          <Input
                            value={resolution.createAccount.product_name}
                            onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                product_name: event.target.value,
                              },
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Account Type</Label>
                          <Select
                            value={resolution.createAccount.account_type}
                            onValueChange={(value) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                account_type: value,
                              },
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
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
                        <div className="space-y-1.5">
                          <Label>Currency</Label>
                          <Input
                            value={resolution.createAccount.currency}
                            onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                currency: event.target.value,
                              },
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Identifier Hint</Label>
                          <Input
                            value={resolution.createAccount.identifier_hint}
                            onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                identifier_hint: event.target.value,
                              },
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Nickname (Optional)</Label>
                          <Input
                            value={resolution.createAccount.nickname}
                            onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                nickname: event.target.value,
                              },
                            }))}
                          />
                        </div>

                        {resolution.createAccount.account_type === 'credit_card' && (
                          <>
                            <div className="space-y-1.5">
                              <Label>Card Name</Label>
                              <Input
                                value={resolution.createAccount.card_name}
                                onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                                  ...current,
                                  createAccount: {
                                    ...current.createAccount,
                                    card_name: event.target.value,
                                  },
                                }))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Card Last 4</Label>
                              <Input
                                value={resolution.createAccount.card_last4}
                                onChange={(event) => updateDescriptorResolution(descriptor.descriptorKey, (current) => ({
                                  ...current,
                                  createAccount: {
                                    ...current.createAccount,
                                    card_last4: event.target.value.replace(/[^0-9]/g, '').slice(0, 4),
                                  },
                                }))}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleContinueRecoveryImport()} disabled={resolvingRecovery} className="gap-2">
                {resolvingRecovery ? <Loader2 className="size-4 animate-spin" /> : null}
                Continue Import
              </Button>
              <Button variant="outline" onClick={() => setParseRecovery(null)} disabled={resolvingRecovery}>
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Import History
          </CardTitle>
          <CardDescription>
            Previously uploaded statements and their processing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <Label>Uploader</Label>
              <Select value={uploaderFilter} onValueChange={setUploaderFilter}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="All household users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All household users</SelectItem>
                  <SelectItem value="me">Me</SelectItem>
                  {uploaderOptions.map((householdUser) => (
                    <SelectItem key={householdUser.id} value={householdUser.id}>
                      {householdUser.display_name || householdUser.email || 'Unnamed user'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredImports.length === 0 ? (
            imports.length === 0 ? (
              <EmptyState
                icon={FileUp}
                title="No statements imported"
                description="Upload your first bank statement to start building your transaction history."
                action={{ label: 'Upload Statement', href: '#statement-upload' }}
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="No matching statement imports"
                description="Try changing the uploader filter to view uploads from another household member."
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">File</th>
                    <th className="pb-3 pr-4 font-medium">Institution</th>
                    <th className="pb-3 pr-4 font-medium">Period</th>
                    <th className="pb-3 pr-4 font-medium">Rows</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Uploader</th>
                    <th className="pb-3 pr-4 font-medium">Uploaded</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImports.map((importRow) => {
                    return (
                      <tr key={importRow.id} className="border-b last:border-0">
                        <td className="max-w-[200px] truncate py-3 pr-4 font-medium">
                          <div>{importRow.file_name}</div>
                          {getImportMatchedAccountLabel(importRow) && (
                            <div className="truncate text-xs font-normal text-muted-foreground">
                              {getImportMatchedAccountLabel(importRow)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          <div>{getImportInstitutionLabel(importRow)}</div>
                          {getImportParsedAccountType(importRow) && (
                            <div className="text-xs">
                              {String(getImportParsedAccountType(importRow)).replace(/_/g, ' ')}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                          {importRow.statement_period_start && importRow.statement_period_end
                            ? `${formatDate(importRow.statement_period_start)} – ${formatDate(importRow.statement_period_end)}`
                            : '—'}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                          {importRow.total_rows != null ? (
                            <span>
                              {importRow.committed_rows ?? 0}/{importRow.total_rows}
                              {(importRow.duplicate_rows ?? 0) > 0 && (
                                <span className="ml-1 text-orange-500">({importRow.duplicate_rows} dup)</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-3 pr-4">
                          {getStatementStatusBadge(importRow.status)}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="font-medium">{getUploaderName(importRow)}</div>
                          {importRow.uploadedByEmail && (
                            <div className="text-xs text-muted-foreground">{importRow.uploadedByEmail}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                          {formatDate(importRow.created_at)}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {(importRow.status === 'in_review' || importRow.status === 'committed' || importRow.status === 'committing') && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={() => router.push(`/statements/review/${importRow.id}`)}
                              >
                                <ExternalLink className="size-3" />
                                {importRow.status === 'in_review' ? 'Review' : 'View'}
                              </Button>
                            )}
                            {importRow.status === 'committed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={() => void handleReopenImport(importRow.id)}
                              >
                                <Pencil className="size-3" />
                                Reopen
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
