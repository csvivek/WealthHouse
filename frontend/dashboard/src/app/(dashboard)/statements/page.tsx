'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FileUp,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { useStatementCommitJobs } from '@/lib/statement-commit-jobs'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
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
    product_name: string
    account_type: string
    identifier_hint: string
    currency: string
    nickname: string
    card_name: string
    card_last4: string
  }
}

const statusConfig: Record<
  string,
  { label: string; color: string; bgColor: string }
> = {
  received: {
    label: 'Received',
    color: 'text-gray-700 dark:text-gray-300',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
  },
  parsing: {
    label: 'Parsing',
    color: 'text-warning-foreground',
    bgColor: 'bg-warning/10',
  },
  in_review: {
    label: 'In Review',
    color: 'text-transfer-foreground',
    bgColor: 'bg-transfer/10',
  },
  committing: {
    label: 'Committing',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  committed: {
    label: 'Committed',
    color: 'text-income-foreground',
    bgColor: 'bg-income/10',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-expense-foreground',
    bgColor: 'bg-expense/10',
  },
  duplicate: {
    label: 'Duplicate',
    color: 'text-warning-foreground',
    bgColor: 'bg-warning/10',
  },
  failed: {
    label: 'Failed',
    color: 'text-expense-foreground',
    bgColor: 'bg-expense/10',
  },
}

// Stats Card Component
function StatsCard({
  label,
  value,
  subvalue,
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  subvalue?: string
  icon?: React.ElementType
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-xl border bg-card p-4 transition-all hover:shadow-sm',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        {Icon && (
          <div className="rounded-lg bg-muted p-1.5">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      {subvalue && (
        <span className="text-xs text-muted-foreground">{subvalue}</span>
      )}
    </div>
  )
}

// Import Timeline Item
function ImportTimelineItem({
  importRow,
  currentUserId,
  onReview,
  onReopen,
}: {
  importRow: FileImportRow
  currentUserId: string
  onReview: () => void
  onReopen: () => void
}) {
  const status = statusConfig[importRow.status] ?? statusConfig.received
  const uploaderName =
    importRow.uploaded_by === currentUserId
      ? 'You'
      : importRow.uploadedByDisplayName ||
        importRow.uploadedByEmail ||
        'Unknown'

  const progressValue =
    importRow.total_rows && importRow.committed_rows
      ? (importRow.committed_rows / importRow.total_rows) * 100
      : 0

  return (
    <div className="group relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-8 h-[calc(100%-32px)] w-px bg-border group-last:hidden" />

      {/* Status indicator */}
      <div
        className={cn(
          'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background',
          importRow.status === 'committed' && 'border-income bg-income/10',
          importRow.status === 'in_review' && 'border-transfer bg-transfer/10',
          importRow.status === 'committing' && 'border-primary bg-primary/10',
          importRow.status === 'failed' && 'border-expense bg-expense/10',
          !['committed', 'in_review', 'committing', 'failed'].includes(
            importRow.status
          ) && 'border-muted-foreground/30'
        )}
      >
        {importRow.status === 'committed' ? (
          <Check className="size-4 text-income" />
        ) : importRow.status === 'committing' || importRow.status === 'parsing' ? (
          <Loader2 className="size-4 animate-spin text-primary" />
        ) : importRow.status === 'failed' ? (
          <X className="size-4 text-expense" />
        ) : (
          <FileText className="size-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 rounded-xl border bg-card p-4 transition-all hover:shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate font-medium">{importRow.file_name}</h4>
              <Badge className={cn('border-0 text-xs', status.bgColor, status.color)}>
                {status.label}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{uploaderName}</span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatDate(importRow.created_at)}
              </span>
              {importRow.institution_code && (
                <span>{importRow.institution_code}</span>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(importRow.status === 'in_review' ||
                importRow.status === 'committed' ||
                importRow.status === 'committing') && (
                <DropdownMenuItem onClick={onReview}>
                  <ExternalLink className="mr-2 size-4" />
                  {importRow.status === 'in_review' ? 'Review' : 'View'}
                </DropdownMenuItem>
              )}
              {importRow.status === 'committed' && (
                <DropdownMenuItem onClick={onReopen}>
                  <Pencil className="mr-2 size-4" />
                  Reopen for Editing
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stats row */}
        {importRow.total_rows != null && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {importRow.committed_rows ?? 0} / {importRow.total_rows}{' '}
                transactions
                {(importRow.duplicate_rows ?? 0) > 0 && (
                  <span className="ml-1 text-warning-foreground">
                    ({importRow.duplicate_rows} duplicates)
                  </span>
                )}
              </span>
            </div>
            <Progress value={progressValue} className="h-1.5" />
          </div>
        )}

        {/* Period badge */}
        {importRow.statement_period_start && importRow.statement_period_end && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3" />
            <span>
              {formatDate(importRow.statement_period_start)} -{' '}
              {formatDate(importRow.statement_period_end)}
            </span>
          </div>
        )}

        {/* Quick actions */}
        {(importRow.status === 'in_review' ||
          importRow.status === 'committed') && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" className="h-7" onClick={onReview}>
              {importRow.status === 'in_review' ? 'Review' : 'View Details'}
              <ArrowRight className="ml-1.5 size-3" />
            </Button>
            {importRow.status === 'committed' && (
              <Button size="sm" variant="ghost" className="h-7" onClick={onReopen}>
                Reopen
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function StatementsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [imports, setImports] = useState<FileImportRow[]>([])
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUploaderProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [uploaderFilter, setUploaderFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [resolvingRecovery, setResolvingRecovery] = useState(false)
  const [parseRecovery, setParseRecovery] = useState<ParseRecoveryState | null>(null)
  const [descriptorResolutions, setDescriptorResolutions] = useState<Record<string, DescriptorResolutionState>>({})
  const [recoverySheetOpen, setRecoverySheetOpen] = useState(false)

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
        .select(
          'id, file_name, uploaded_by, institution_code, status, total_rows, approved_rows, rejected_rows, duplicate_rows, committed_rows, statement_period_start, statement_period_end, created_at'
        )
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
      householdProfiles.map((householdProfile) => [householdProfile.id, householdProfile])
    )
    const importRows = (
      (importRes.data as Array<Omit<FileImportRow, 'uploadedByDisplayName' | 'uploadedByEmail'>> | null) ?? []
    ).map((importRow) => {
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
    return `${option.institutions?.name ? `${option.institutions.name} - ` : ''}${option.nickname ?? option.product_name}`
  }

  const uploaderOptions = useMemo(
    () =>
      householdUsers.filter(
        (householdUser) => householdUser.id !== currentUserId
      ),
    [currentUserId, householdUsers]
  )

  const filteredImports = useMemo(() => {
    let result = imports

    if (uploaderFilter !== 'all') {
      if (uploaderFilter === 'me') {
        result = result.filter((importRow) => importRow.uploaded_by === currentUserId)
      } else {
        result = result.filter((importRow) => importRow.uploaded_by === uploaderFilter)
      }
    }

    if (statusFilter !== 'all') {
      result = result.filter((importRow) => importRow.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (importRow) =>
          importRow.file_name.toLowerCase().includes(query) ||
          importRow.institution_code?.toLowerCase().includes(query)
      )
    }

    return result
  }, [currentUserId, imports, uploaderFilter, statusFilter, searchQuery])

  const stats = useMemo(() => {
    const totalImports = imports.length
    const committed = imports.filter((i) => i.status === 'committed').length
    const inReview = imports.filter((i) => i.status === 'in_review').length
    const totalTransactions = imports.reduce(
      (sum, i) => sum + (i.committed_rows ?? 0),
      0
    )
    return { totalImports, committed, inReview, totalTransactions }
  }, [imports])

  function initializeRecoveryState(payload: ParseRecoveryState) {
    setParseRecovery(payload)
    setRecoverySheetOpen(true)

    const next: Record<string, DescriptorResolutionState> = {}
    for (const descriptor of payload.unmatchedAccountDescriptors ?? []) {
      const defaultMode: ResolutionMode = descriptor.suggestedExistingAccountId
        ? 'existing'
        : 'create'
      next[descriptor.descriptorKey] = {
        mode: defaultMode,
        existingAccountId: descriptor.suggestedExistingAccountId || '',
        createAccount: {
          institution_name: descriptor.institution_name || '',
          product_name: descriptor.card_name || descriptor.product_name || '',
          account_type: descriptor.account_type || 'savings',
          identifier_hint:
            descriptor.identifier_hint || descriptor.card_last4 || '',
          currency: descriptor.currency || 'SGD',
          nickname: '',
          card_name: descriptor.card_name || descriptor.product_name || '',
          card_last4: descriptor.card_last4 || '',
        },
      }
    }

    setDescriptorResolutions(next)
  }

  function updateDescriptorResolution(
    descriptorKey: string,
    updater: (current: DescriptorResolutionState) => DescriptorResolutionState
  ) {
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
          toast.error(
            `This file has already been processed: ${data.existingFileName}`
          )
          if (data.existingStatus === 'in_review') {
            router.push(`/statements/review/${data.existingImportId}`)
          }
          return
        }

        if (
          res.status === 422 &&
          data?.code === 'transaction_account_match_required' &&
          data?.parseSessionId
        ) {
          initializeRecoveryState({
            parseSessionId: data.parseSessionId,
            error:
              data.error ||
              'Account matching needs your review before import can continue.',
            unmatchedAccountDescriptors:
              (data.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
            suggestedExistingAccounts:
              (data.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
          })
          toast.error(
            'Account matching needs your review. Continue import below without re-uploading.'
          )
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
        toast.error(
          'Missing resolution state for one or more unmatched descriptors.'
        )
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
        toast.error(
          `Institution and product name are required for: ${descriptor.label}`
        )
        return
      }

      resolutions.push({
        descriptorKey: descriptor.descriptorKey,
        createAccount: {
          institution_name: create.institution_name.trim(),
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
        if (
          res.status === 422 &&
          data?.code === 'transaction_account_match_required' &&
          data?.parseSessionId
        ) {
          initializeRecoveryState({
            parseSessionId: data.parseSessionId,
            error:
              data.error || 'Some transactions still need account resolution.',
            unmatchedAccountDescriptors:
              (data.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
            suggestedExistingAccounts:
              (data.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
          })
          toast.error(
            'Some transactions still need account resolution. Please review and continue.'
          )
          return
        }

        toast.error(data.error || 'Failed to continue import')
        return
      }

      setParseRecovery(null)
      setDescriptorResolutions({})
      setRecoverySheetOpen(false)
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
      const res = await fetch(`/api/ai/statement/${importId}/reopen`, {
        method: 'POST',
      })
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
        <div className="flex flex-col items-center gap-2">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading statements...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Statements</h1>
          <p className="text-sm text-muted-foreground">
            Import and manage your bank and credit card statements
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <Plus className="mr-2 size-4" />
          Import Statement
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          label="Total Imports"
          value={stats.totalImports}
          subvalue={`${stats.committed} committed`}
          icon={FileText}
        />
        <StatsCard
          label="In Review"
          value={stats.inReview}
          subvalue="Awaiting approval"
          icon={Clock}
        />
        <StatsCard
          label="Transactions"
          value={stats.totalTransactions.toLocaleString()}
          subvalue="Successfully imported"
          icon={Check}
        />
        <StatsCard
          label="Accounts"
          value={accounts.length}
          subvalue="Available for linking"
          icon={Upload}
        />
      </div>

      {/* Upload Section */}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="border-b px-6 py-4">
          <h2 className="font-semibold">Upload Statement</h2>
          <p className="text-sm text-muted-foreground">
            Drop a file or click to browse. Account matching is automatic.
          </p>
        </div>
        <div className="p-6">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Link to Account (Optional)</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-[300px]">
                  <SelectValue placeholder="Auto-detect from statement" />
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
            {selectedAccountId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAccountId('')}
              >
                Clear selection
              </Button>
            )}
          </div>

          <div
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-all',
              dragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30',
              uploading && 'pointer-events-none opacity-60'
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
                <Loader2 className="mb-3 size-10 animate-spin text-primary" />
                <p className="font-medium">Processing statement...</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  This may take 10-30 seconds
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 rounded-xl bg-muted p-3">
                  <FileUp className="size-8 text-muted-foreground" />
                </div>
                <p className="font-medium">
                  Drop your statement here or click to browse
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Supports PDF, JPEG, PNG, ZIP, TXT
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Recovery Alert */}
      {parseRecovery && !recoverySheetOpen && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning/10 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/20 p-2">
              <AlertTriangle className="size-5 text-warning-foreground" />
            </div>
            <div>
              <p className="font-medium">Account matching needs review</p>
              <p className="text-sm text-muted-foreground">
                Some transactions need to be matched to accounts
              </p>
            </div>
          </div>
          <Button onClick={() => setRecoverySheetOpen(true)}>
            Continue Import
            <ChevronRight className="ml-1.5 size-4" />
          </Button>
        </div>
      )}

      {/* Import History */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Import History</h2>
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search imports..."
                className="w-[200px] pl-9"
              />
            </div>

            {/* Filter Toggle */}
            <Button
              variant={showFilters ? 'secondary' : 'outline'}
              size="icon"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="size-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <Select value={uploaderFilter} onValueChange={setUploaderFilter}>
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="All uploaders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All uploaders</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {uploaderOptions.map((householdUser) => (
                  <SelectItem key={householdUser.id} value={householdUser.id}>
                    {householdUser.display_name ||
                      householdUser.email ||
                      'Unnamed user'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px] bg-background">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="committed">Committed</SelectItem>
                <SelectItem value="committing">Committing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUploaderFilter('all')
                setStatusFilter('all')
                setSearchQuery('')
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        {/* Timeline */}
        {filteredImports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
            <div className="rounded-full bg-muted p-4">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No imports found</p>
              <p className="text-sm text-muted-foreground">
                {imports.length === 0
                  ? 'Upload your first statement to get started'
                  : 'No imports match your current filters'}
              </p>
            </div>
            {imports.length === 0 && (
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 size-4" />
                Import Statement
              </Button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border bg-card p-6">
            {filteredImports.map((importRow) => (
              <ImportTimelineItem
                key={importRow.id}
                importRow={importRow}
                currentUserId={currentUserId}
                onReview={() => router.push(`/statements/review/${importRow.id}`)}
                onReopen={() => void handleReopenImport(importRow.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recovery Sheet */}
      <Sheet open={recoverySheetOpen} onOpenChange={setRecoverySheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-warning" />
              Account Matching Required
            </SheetTitle>
            <SheetDescription>
              {parseRecovery?.error || 'Some transactions need to be matched to accounts before the import can continue.'}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6">
            {parseRecovery?.unmatchedAccountDescriptors.map((descriptor) => {
              const resolution = descriptorResolutions[descriptor.descriptorKey]
              if (!resolution) return null

              return (
                <Collapsible key={descriptor.descriptorKey} defaultOpen>
                  <div className="rounded-xl border">
                    <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 hover:bg-muted/50">
                      <div className="text-left">
                        <p className="font-medium">{descriptor.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {descriptor.transactionCount} transaction(s)
                        </p>
                      </div>
                      {descriptor.suggestedExistingAccountLabel && (
                        <Badge variant="secondary" className="text-xs">
                          Suggested: {descriptor.suggestedExistingAccountLabel}
                        </Badge>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-4 border-t px-4 py-4">
                        <div className="space-y-2">
                          <Label>Resolution Mode</Label>
                          <Tabs
                            value={resolution.mode}
                            onValueChange={(value) =>
                              updateDescriptorResolution(
                                descriptor.descriptorKey,
                                (current) => ({
                                  ...current,
                                  mode: value as ResolutionMode,
                                })
                              )
                            }
                          >
                            <TabsList className="w-full">
                              <TabsTrigger value="existing" className="flex-1">
                                Use Existing
                              </TabsTrigger>
                              <TabsTrigger value="create" className="flex-1">
                                Create New
                              </TabsTrigger>
                            </TabsList>
                          </Tabs>
                        </div>

                        {resolution.mode === 'existing' ? (
                          <div className="space-y-2">
                            <Label>Select Account</Label>
                            <Select
                              value={resolution.existingAccountId}
                              onValueChange={(value) =>
                                updateDescriptorResolution(
                                  descriptor.descriptorKey,
                                  (current) => ({
                                    ...current,
                                    existingAccountId: value,
                                  })
                                )
                              }
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
                          <div className="grid gap-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Institution</Label>
                                <Input
                                  value={resolution.createAccount.institution_name}
                                  onChange={(event) =>
                                    updateDescriptorResolution(
                                      descriptor.descriptorKey,
                                      (current) => ({
                                        ...current,
                                        createAccount: {
                                          ...current.createAccount,
                                          institution_name: event.target.value,
                                        },
                                      })
                                    )
                                  }
                                  placeholder="Bank name"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Product Name</Label>
                                <Input
                                  value={resolution.createAccount.product_name}
                                  onChange={(event) =>
                                    updateDescriptorResolution(
                                      descriptor.descriptorKey,
                                      (current) => ({
                                        ...current,
                                        createAccount: {
                                          ...current.createAccount,
                                          product_name: event.target.value,
                                        },
                                      })
                                    )
                                  }
                                  placeholder="Account name"
                                />
                              </div>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Account Type</Label>
                                <Select
                                  value={resolution.createAccount.account_type}
                                  onValueChange={(value) =>
                                    updateDescriptorResolution(
                                      descriptor.descriptorKey,
                                      (current) => ({
                                        ...current,
                                        createAccount: {
                                          ...current.createAccount,
                                          account_type: value,
                                        },
                                      })
                                    )
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="savings">Savings</SelectItem>
                                    <SelectItem value="current">Current</SelectItem>
                                    <SelectItem value="credit_card">Credit Card</SelectItem>
                                    <SelectItem value="investment">Investment</SelectItem>
                                    <SelectItem value="loan">Loan</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Currency</Label>
                                <Input
                                  value={resolution.createAccount.currency}
                                  onChange={(event) =>
                                    updateDescriptorResolution(
                                      descriptor.descriptorKey,
                                      (current) => ({
                                        ...current,
                                        createAccount: {
                                          ...current.createAccount,
                                          currency: event.target.value,
                                        },
                                      })
                                    )
                                  }
                                  placeholder="SGD"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })}
          </div>

          <SheetFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => {
                setRecoverySheetOpen(false)
                setParseRecovery(null)
              }}
              disabled={resolvingRecovery}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleContinueRecoveryImport()}
              disabled={resolvingRecovery}
            >
              {resolvingRecovery ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Continue Import'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
