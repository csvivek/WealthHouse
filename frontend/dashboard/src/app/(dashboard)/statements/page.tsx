'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Upload,
  FileUp,
  Loader2,
  FileText,
  ExternalLink,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react'
import { ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
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
import { useStatementIngestionJobs } from '@/lib/statement-ingestion-jobs'
import { formatDate } from '@/lib/format'
import { isStatementStorageSchemaNotReadyError } from '@/lib/statements/config'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/empty-state'
import { InstitutionBrandPicker, type InstitutionBrandDecision, type InstitutionBrandPreviewState } from '@/components/institution-brand-picker'
import { toast } from 'sonner'

interface AccountOption {
  id: string
  product_name: string
  nickname: string | null
  identifier_hint: string | null
  account_type: string
  institutions: { name: string } | null
}

interface FileImportRow {
  id: string
  file_name: string
  uploaded_by: string
  statement_upload_id?: string | null
  storage_bucket: string | null
  storage_path: string | null
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
  hasStoredFile: boolean
}

const FILE_IMPORTS_SELECT_WITH_STORAGE = 'id, file_name, uploaded_by, statement_upload_id, storage_bucket, storage_path, institution_code, raw_parse_result, status, total_rows, approved_rows, rejected_rows, duplicate_rows, committed_rows, statement_period_start, statement_period_end, created_at'
const FILE_IMPORTS_SELECT_FALLBACK = 'id, file_name, uploaded_by, statement_upload_id, institution_code, raw_parse_result, status, total_rows, approved_rows, rejected_rows, duplicate_rows, committed_rows, statement_period_start, statement_period_end, created_at'

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
  statementUploadId: string | null
  fileName: string | null
  error: string
  unmatchedAccountDescriptors: UnmatchedAccountDescriptor[]
  suggestedExistingAccounts: SuggestedExistingAccount[]
}

interface ExistingImportSummary {
  importId: string
  importLabel: string
  accountLabel: string | null
  reviewUrl: string
  status: string
}

interface DuplicateImportRecoveryState {
  statementUploadId: string
  fileName: string
  importCount: number
  imports: ExistingImportSummary[]
}

type ResolutionMode = 'existing' | 'create'

interface DescriptorResolutionState {
  mode: ResolutionMode
  existingAccountId: string
  createAccount: {
    institution_name: string
    institution_code: string
    institution_brand_code: string
    institution_brand_decision: InstitutionBrandDecision
    institution_brand_preview: InstitutionBrandPreviewState | null
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
  const searchParams = useSearchParams()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [imports, setImports] = useState<FileImportRow[]>([])
  const [householdUsers, setHouseholdUsers] = useState<HouseholdUploaderProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [uploaderFilter, setUploaderFilter] = useState<string>('all')

  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [deletingImportId, setDeletingImportId] = useState<string | null>(null)
  const [resolvingRecoveryId, setResolvingRecoveryId] = useState<string | null>(null)
  const [parseRecoveries, setParseRecoveries] = useState<Record<string, ParseRecoveryState>>({})
  const [duplicateImportRecoveries, setDuplicateImportRecoveries] = useState<Record<string, DuplicateImportRecoveryState>>({})
  const [descriptorResolutions, setDescriptorResolutions] = useState<Record<string, Record<string, DescriptorResolutionState>>>({})

  const { hasActiveJobs: hasActiveCommitJobs } = useStatementCommitJobs()
  const {
    jobs: ingestionJobs,
    hasActiveJobs: hasActiveIngestionJobs,
    trackJob,
  } = useStatementIngestionJobs()
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
        .select('id, product_name, nickname, identifier_hint, account_type, institutions(name)')
        .eq('household_id', profile.household_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      (async () => {
        const withStorage = await supabase
          .from('file_imports')
          .select(FILE_IMPORTS_SELECT_WITH_STORAGE)
          .eq('household_id', profile.household_id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (!isStatementStorageSchemaNotReadyError(withStorage.error, 'file_imports')) {
          return withStorage
        }

        const fallback = await supabase
          .from('file_imports')
          .select(FILE_IMPORTS_SELECT_FALLBACK)
          .eq('household_id', profile.household_id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (fallback.error || !Array.isArray(fallback.data)) {
          return fallback
        }

        return {
          ...fallback,
          data: fallback.data.map((importRow) => ({
            ...importRow,
            storage_bucket: null,
            storage_path: null,
          })),
        }
      })(),
      fetch('/api/household/profiles'),
    ])

    const householdProfilesPayload = householdProfilesResponse.ok
      ? await householdProfilesResponse.json().catch(() => ({ profiles: [] }))
      : { profiles: [] }
    const householdProfiles = (householdProfilesPayload.profiles ?? []) as HouseholdUploaderProfile[]
    const uploadersById = new Map(
      householdProfiles.map((householdProfile) => [householdProfile.id, householdProfile]),
    )
    const importRows = ((importRes.data as Array<Omit<FileImportRow, 'uploadedByDisplayName' | 'uploadedByEmail' | 'hasStoredFile'>> | null) ?? [])
      .map((importRow) => {
        const uploader = uploadersById.get(importRow.uploaded_by)
        return {
          ...importRow,
          hasStoredFile: Boolean(importRow.statement_upload_id || (importRow.storage_bucket && importRow.storage_path)),
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
    if (!hasActiveCommitJobs && !hasActiveIngestionJobs) return

    void fetchData()
    const interval = window.setInterval(() => {
      void fetchData()
    }, 3000)

    return () => window.clearInterval(interval)
  }, [hasActiveCommitJobs, hasActiveIngestionJobs, fetchData])

  useEffect(() => {
    const pausedJobs = ingestionJobs.filter((job) => job.status === 'needs_action' && job.result?.status === 'needs_account_resolution')

    for (const job of pausedJobs) {
      const parseSessionId = job.result?.status === 'needs_account_resolution' ? job.result.parseSessionId : null
      if (!parseSessionId || parseRecoveries[parseSessionId]) continue

      void (async () => {
        const response = await fetch(`/api/ai/statement/parse-session/${parseSessionId}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload) return

        initializeRecoveryState({
          parseSessionId,
          statementUploadId: typeof payload.statementUploadId === 'string' ? payload.statementUploadId : null,
          fileName: typeof payload.fileName === 'string' ? payload.fileName : null,
          error: 'Account matching needs your review before import can continue.',
          unmatchedAccountDescriptors: (payload.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
          suggestedExistingAccounts: (payload.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
        })
      })()
    }
  }, [ingestionJobs, parseRecoveries])

  useEffect(() => {
    const resumeParseSessionId = searchParams.get('parseSessionId')
    if (!resumeParseSessionId || parseRecoveries[resumeParseSessionId]) return

    void (async () => {
      const response = await fetch(`/api/ai/statement/parse-session/${resumeParseSessionId}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload) return

      initializeRecoveryState({
        parseSessionId: resumeParseSessionId,
        statementUploadId: typeof payload.statementUploadId === 'string' ? payload.statementUploadId : null,
        fileName: typeof payload.fileName === 'string' ? payload.fileName : null,
        error: 'Account matching needs your review before import can continue.',
        unmatchedAccountDescriptors: (payload.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
        suggestedExistingAccounts: (payload.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
      })
    })()
  }, [parseRecoveries, searchParams])

  function getAccountLabel(option: AccountOption) {
    const label = `${option.institutions?.name ? `${option.institutions.name} — ` : ''}${option.nickname ?? option.product_name}`
    return option.identifier_hint ? `${label} (${option.identifier_hint})` : label
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
    setParseRecoveries((current) => ({
      ...current,
      [payload.parseSessionId]: payload,
    }))

    const next: Record<string, DescriptorResolutionState> = {}
    for (const descriptor of payload.unmatchedAccountDescriptors ?? []) {
      const defaultMode: ResolutionMode = descriptor.suggestedExistingAccountId ? 'existing' : 'create'
      next[descriptor.descriptorKey] = {
        mode: defaultMode,
        existingAccountId: descriptor.suggestedExistingAccountId || '',
        createAccount: {
          institution_name: descriptor.institution_name || '',
          institution_code: descriptor.institution_code || '',
          institution_brand_code: '',
          institution_brand_decision: null,
          institution_brand_preview: null,
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

    setDescriptorResolutions((current) => ({
      ...current,
      [payload.parseSessionId]: next,
    }))
  }

  function updateDescriptorResolution(
    parseSessionId: string,
    descriptorKey: string,
    updater: (current: DescriptorResolutionState) => DescriptorResolutionState,
  ) {
    setDescriptorResolutions((current) => {
      const sessionState = current[parseSessionId]
      if (!sessionState) return current
      const existing = sessionState[descriptorKey]
      if (!existing) return current
      return {
        ...current,
        [parseSessionId]: {
          ...sessionState,
          [descriptorKey]: updater(existing),
        },
      }
    })
  }

  function initializeDuplicateImportRecovery(payload: DuplicateImportRecoveryState) {
    setDuplicateImportRecoveries((current) => ({
      ...current,
      [payload.statementUploadId]: payload,
    }))
  }

  function removeImportFromDuplicateRecoveries(importId: string) {
    setDuplicateImportRecoveries((current) => {
      const next: Record<string, DuplicateImportRecoveryState> = {}

      for (const [statementUploadId, recovery] of Object.entries(current)) {
        const remainingImports = recovery.imports.filter((existingImport) => existingImport.importId !== importId)
        if (remainingImports.length === 0) continue

        next[statementUploadId] = {
          ...recovery,
          importCount: Math.max(remainingImports.length, recovery.importCount - 1),
          imports: remainingImports,
        }
      }

      return next
    })
  }

  async function uploadSingleFile(file: File) {
    const formData = new FormData()
    formData.append('statement', file)
    if (selectedAccountId) {
      formData.append('account_id', selectedAccountId)
    }

    const response = await fetch('/api/ai/statement', {
      method: 'POST',
      body: formData,
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 409) {
        const existingStatus = typeof payload.existingStatus === 'string' ? payload.existingStatus : null
        const parseSessionId = typeof payload.parseSessionId === 'string' ? payload.parseSessionId : null

        if (existingStatus === 'needs_account_resolution' && parseSessionId) {
          const recoveryResponse = await fetch(`/api/ai/statement/parse-session/${parseSessionId}`, { cache: 'no-store' })
          const recoveryPayload = await recoveryResponse.json().catch(() => null)

          if (!recoveryResponse.ok || !recoveryPayload) {
            throw new Error(payload.error || `Failed to resume ${file.name}`)
          }

          initializeRecoveryState({
            parseSessionId,
            statementUploadId: typeof recoveryPayload.statementUploadId === 'string' ? recoveryPayload.statementUploadId : null,
            fileName: typeof recoveryPayload.fileName === 'string' ? recoveryPayload.fileName : null,
            error: 'Account matching needs your review before import can continue.',
            unmatchedAccountDescriptors: (recoveryPayload.unmatchedAccountDescriptors ?? []) as UnmatchedAccountDescriptor[],
            suggestedExistingAccounts: (recoveryPayload.suggestedExistingAccounts ?? []) as SuggestedExistingAccount[],
          })
          toast.success(`${payload.existingFileName || file.name} is waiting for account matching. Continue below.`)
          return
        }

        if (existingStatus === 'queued' || existingStatus === 'parsing') {
          toast.error(`${payload.existingFileName || file.name} is already being processed.`)
          return
        }

        if (existingStatus === 'failed') {
          toast.error(payload.error || `${payload.existingFileName || file.name} hit a previous failed upload.`)
          return
        }

        const existingImports: Array<Record<string, unknown>> = Array.isArray(payload.existingImports)
          ? payload.existingImports as Array<Record<string, unknown>>
          : []
        const count = typeof payload.existingImportCount === 'number' ? payload.existingImportCount : existingImports.length
        if (existingImports.length === 1) {
          const reviewUrl = typeof existingImports[0]?.reviewUrl === 'string' ? existingImports[0].reviewUrl : null
          if (reviewUrl) {
            toast.success(`${payload.existingFileName || file.name} was already imported. Opening the existing review.`)
            router.push(reviewUrl)
            return
          }
        }

        const recoverableImports = existingImports
          .map((existingImport) => {
            const importId = typeof existingImport?.importId === 'string' ? existingImport.importId : null
            const importLabel = typeof existingImport?.importLabel === 'string' ? existingImport.importLabel : null
            const accountLabel = typeof existingImport?.accountLabel === 'string' ? existingImport.accountLabel : null
            const reviewUrl = typeof existingImport?.reviewUrl === 'string' ? existingImport.reviewUrl : null
            const status = typeof existingImport?.status === 'string' ? existingImport.status : 'in_review'

            if (!importId || !importLabel || !reviewUrl) {
              return null
            }

            return {
              importId,
              importLabel,
              accountLabel,
              reviewUrl,
              status,
            } satisfies ExistingImportSummary
          })
          .filter((existingImport): existingImport is ExistingImportSummary => existingImport !== null)

        if (count > 1 && recoverableImports.length > 0) {
          const statementUploadId = typeof payload.statementUploadId === 'string'
            ? payload.statementUploadId
            : recoverableImports.map((existingImport) => existingImport.importId).join(':')

          initializeDuplicateImportRecovery({
            statementUploadId,
            fileName: payload.existingFileName || file.name,
            importCount: count,
            imports: recoverableImports,
          })
          toast.success(`${payload.existingFileName || file.name} was already imported into ${count} account-specific reviews. Open one below.`)
          void fetchData()
          return
        }

        toast.error(
          count > 1
            ? `${payload.existingFileName || file.name} was already imported into ${count} account-specific reviews.`
            : `${payload.existingFileName || file.name} was already imported.`,
        )
        return
      }

      throw new Error(payload.error || `Failed to queue ${file.name}`)
    }

    if (payload?.job) {
      trackJob(payload.job)
    }
  }

  async function handleUpload(files: File[]) {
    if (files.length === 0) return

    setUploadingCount((current) => current + files.length)

    const queue = [...files]
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length > 0) {
        const file = queue.shift()
        if (!file) return

        try {
          await uploadSingleFile(file)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Failed to queue ${file.name}`)
        } finally {
          setUploadingCount((current) => Math.max(0, current - 1))
        }
      }
    })

    await Promise.all(workers)
    await fetchData()
  }

  async function handleContinueRecoveryImport(parseSessionId: string) {
    const parseRecovery = parseRecoveries[parseSessionId]
    if (!parseRecovery) return

    const resolutions = [] as Array<Record<string, unknown>>

    for (const descriptor of parseRecovery.unmatchedAccountDescriptors) {
      const state = descriptorResolutions[parseSessionId]?.[descriptor.descriptorKey]
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

      if ((create.institution_brand_preview?.matched || create.institution_brand_code) && !create.institution_brand_decision) {
        toast.error(`Choose whether to use the verified institution brand for: ${descriptor.label}`)
        return
      }

      const verifiedBrand = create.institution_brand_decision === 'verified'
        ? create.institution_brand_preview
        : null

      resolutions.push({
        descriptorKey: descriptor.descriptorKey,
        createAccount: {
          institution_name: verifiedBrand?.canonicalName?.trim() || create.institution_name.trim(),
          institution_code: create.institution_code.trim() || null,
          institution_brand_code: verifiedBrand?.brandCode || null,
          institution_brand_decision: verifiedBrand ? 'verified' : 'generic',
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

    setResolvingRecoveryId(parseSessionId)
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
        toast.error(data.error || 'Failed to continue import')
        return
      }

      if (data?.job) {
        trackJob(data.job)
      }

      setParseRecoveries((current) => {
        const next = { ...current }
        delete next[parseSessionId]
        return next
      })
      setDescriptorResolutions((current) => {
        const next = { ...current }
        delete next[parseSessionId]
        return next
      })
      toast.success('Import resumed in the background.')
    } catch {
      toast.error('Failed to continue import')
    } finally {
      setResolvingRecoveryId(null)
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) void handleUpload(files)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length > 0) void handleUpload(files)
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

  async function handleDeleteImport(importId: string, fileName: string) {
    const confirmed = window.confirm(
      `Delete ${fileName} and all data imported from it?\n\nThis removes its review rows, committed statement transactions, and any stale upload record that no longer has live imports.`,
    )
    if (!confirmed) return

    setDeletingImportId(importId)
    try {
      const res = await fetch(`/api/ai/statement/${importId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(data.error || 'Failed to delete import')
        return
      }

      removeImportFromDuplicateRecoveries(importId)
      toast.success(`${data.fileName || fileName} deleted`)
      await fetchData()
    } catch {
      toast.error('Failed to delete import')
    } finally {
      setDeletingImportId(null)
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
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="Import Workspace"
        title="Statements"
        description="Upload bank and credit card statements, recover parser mismatches, and preserve the full import review flow."
        actions={(
          <Button variant="outline" onClick={() => router.push('/statements/overview')}>
            Overview
          </Button>
        )}
        badges={(
          <>
            <Badge variant="outline">{imports.length} recent imports</Badge>
            {hasActiveIngestionJobs ? <Badge variant="outline">Import jobs active</Badge> : null}
            {hasActiveCommitJobs ? <Badge variant="outline">Commit jobs active</Badge> : null}
          </>
        )}
      />

      <Card id="statement-upload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Import Statement
          </CardTitle>
          <CardDescription>
            Account selection is optional. It is treated as a hint during background processing, but multi-account statements can still split into separate account-specific imports.
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
                  Leave blank to auto-match after parsing. If you choose an account, it will be used as a hint for single-account statements only.
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
              uploadingCount > 0 && 'pointer-events-none opacity-60',
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
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {uploadingCount > 0 ? (
              <>
                <Loader2 className="mb-3 size-10 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium">Queueing statement imports…</p>
                <p className="text-xs text-muted-foreground">{uploadingCount} file(s) still being submitted</p>
              </>
            ) : (
              <>
                <FileUp className="mb-3 size-10 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Drop one or more statements here or click to browse
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Supports PDF, JPEG, PNG, ZIP, TXT. Files process independently in the background.
                </p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {Object.values(duplicateImportRecoveries).map((duplicateRecovery) => (
        <Card key={duplicateRecovery.statementUploadId} className="border-sky-300/60 bg-sky-50/50 dark:border-sky-700/50 dark:bg-sky-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ExternalLink className="size-4 text-sky-600" />
              Statement Already Imported
            </CardTitle>
            <CardDescription className="text-sky-900 dark:text-sky-100">
              {duplicateRecovery.fileName} already created {duplicateRecovery.importCount} account-specific review{duplicateRecovery.importCount === 1 ? '' : 's'}.
              Open the matching review below instead of re-uploading it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {duplicateRecovery.imports.map((existingImport) => (
                <div key={existingImport.importId} className="rounded-md border bg-background p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{existingImport.accountLabel || existingImport.importLabel}</p>
                      {existingImport.accountLabel && existingImport.importLabel !== existingImport.accountLabel ? (
                        <p className="truncate text-xs text-muted-foreground">{existingImport.importLabel}</p>
                      ) : null}
                    </div>
                    {getStatementStatusBadge(existingImport.status)}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => router.push(existingImport.reviewUrl)}
                  >
                    <ExternalLink className="size-3" />
                    Open {existingImport.accountLabel || existingImport.importLabel}
                  </Button>
                </div>
              ))}
            </div>

            {duplicateRecovery.imports.length < duplicateRecovery.importCount ? (
              <p className="text-xs text-sky-900/80 dark:text-sky-100/80">
                {duplicateRecovery.imports.length} of {duplicateRecovery.importCount} review links are currently available here.
              </p>
            ) : null}

            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDuplicateImportRecoveries((current) => {
                  const next = { ...current }
                  delete next[duplicateRecovery.statementUploadId]
                  return next
                })}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {Object.values(parseRecoveries).map((parseRecovery) => (
        <Card key={parseRecovery.parseSessionId} className="border-amber-300/60 bg-amber-50/50 dark:border-amber-700/50 dark:bg-amber-950/20">
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
              Continue import for {parseRecovery.fileName || 'this statement'} without re-uploading it.
            </p>

            <div className="space-y-4">
              {parseRecovery.unmatchedAccountDescriptors.map((descriptor) => {
                const resolution = descriptorResolutions[parseRecovery.parseSessionId]?.[descriptor.descriptorKey]
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
                          updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                            updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                            onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                institution_name: event.target.value,
                                institution_brand_code: '',
                                institution_brand_decision: null,
                                institution_brand_preview: null,
                              },
                            }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <InstitutionBrandPicker
                            institutionName={resolution.createAccount.institution_name}
                            institutionCode={resolution.createAccount.institution_code}
                            selection={resolution.createAccount.institution_brand_decision}
                            onSelectionChange={(selection) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                institution_brand_decision: selection,
                              },
                            }))}
                            onPreviewChange={(preview) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
                              ...current,
                              createAccount: {
                                ...current.createAccount,
                                institution_brand_preview: preview,
                                institution_brand_code: preview?.brandCode || '',
                              },
                            }))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Product Name</Label>
                          <Input
                            value={resolution.createAccount.product_name}
                            onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                            onValueChange={(value) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                            onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                            onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                            onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                                onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
                                onChange={(event) => updateDescriptorResolution(parseRecovery.parseSessionId, descriptor.descriptorKey, (current) => ({
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
              <Button onClick={() => void handleContinueRecoveryImport(parseRecovery.parseSessionId)} disabled={resolvingRecoveryId === parseRecovery.parseSessionId} className="gap-2">
                {resolvingRecoveryId === parseRecovery.parseSessionId ? <Loader2 className="size-4 animate-spin" /> : null}
                Continue Import
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setParseRecoveries((current) => {
                    const next = { ...current }
                    delete next[parseRecovery.parseSessionId]
                    return next
                  })
                }}
                disabled={resolvingRecoveryId === parseRecovery.parseSessionId}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

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
                            {importRow.hasStoredFile && (
                              <Button asChild variant="ghost" size="sm" className="gap-1 text-xs">
                                <a href={`/api/ai/statement/${importRow.id}/file`} target="_blank" rel="noreferrer">
                                  <FileText className="size-3" />
                                  Open Statement
                                </a>
                              </Button>
                            )}
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
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-xs text-destructive hover:text-destructive"
                              onClick={() => void handleDeleteImport(importRow.id, importRow.file_name)}
                              disabled={deletingImportId === importRow.id}
                            >
                              {deletingImportId === importRow.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                              Delete
                            </Button>
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
    </ExecutivePage>
  )
}
