'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRightLeft,
  BriefcaseBusiness,
  Bus,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Copy,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Loader2,
  Pencil,
  Plane,
  Plus,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Wallet,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useStatementCommitJobs } from '@/lib/statement-commit-jobs'

interface ImportMeta {
  id: string
  status: string
  fileName: string
  institutionCode: string | null
  statementDate: string | null
  period: { start: string | null; end: string | null }
  summary: Record<string, unknown> | null
  cardInfo: Record<string, unknown> | null
  currency: string | null
  createdAt: string
  hasCommittedVersion: boolean
  isRevision: boolean
  canReopen: boolean
}

interface StagingRow {
  id: string
  rowIndex: number
  reviewStatus: 'pending' | 'approved' | 'rejected' | 'committed'
  duplicateStatus: 'none' | 'existing_final' | 'within_import'
  flagStatus: 'none' | 'already_imported' | 'duplicate_in_file'
  duplicateTransactionId: string | null
  committedTransactionId: string | null
  isEdited: boolean
  txnDate: string
  postingDate: string | null
  merchantRaw: string
  description: string | null
  amount: number
  txnType: string
  currency: string
  reference: string | null
  originalAmount: number | null
  originalCurrency: string | null
  originalData: Record<string, unknown>
  reviewNote: string | null
  accountLabel: string | null
  categoryId: number | null
  categoryName: string | null
  categoryConfidence: number | null
  categoryDecisionSource: string | null
  merchantCanonicalName: string | null
  merchantBusinessType: string | null
  merchantAliases: string[]
  similarMerchantKey: string | null
  similarMerchantCount: number
  similarMerchantExamples: string[]
  searchSummary: string | null
}

interface ReviewCategory {
  id: number
  name: string
  type: 'income' | 'expense' | 'transfer'
  group_name: string | null
}

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
  committed: number
  alreadyImported: number
  duplicates: number
  debitTotal: number
  creditTotal: number
}

interface EditDraft {
  txnDate?: string
  merchantRaw?: string
  description?: string | null
  amount?: number
  txnType?: string
  currency?: string
  reference?: string | null
  categoryId?: number | null
  createCategoryMode?: boolean
  newCategoryName?: string
  newCategoryGroupName?: string
}

interface PropagationPreviewTarget {
  rowId: string
  rowIndex: number
  merchantRaw: string
  txnType: string
  amount: number
  accountLabel: string | null
  currentCategoryId: number | null
  currentCategoryName: string | null
  proposedCategoryId: number | null
  proposedCategoryName: string | null
  reason: string
  selectedByDefault: boolean
}

interface PropagationPreviewResponse {
  sourceRow: {
    rowId: string
    rowIndex: number
    merchantRaw: string
    txnType: string
    amount: number
    accountLabel: string | null
    currentCategoryId: number | null
    currentCategoryName: string | null
  }
  resolvedCategory: ReviewCategory | null
  preselectedTargets: PropagationPreviewTarget[]
  optionalTargets: PropagationPreviewTarget[]
  excludedTargets: PropagationPreviewTarget[]
}

interface PendingPropagationDialog {
  rowId: string
  fields: Record<string, unknown>
  preview: PropagationPreviewResponse
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'committed' | 'already_imported' | 'duplicate'

type CategoryCompatibility = ReviewCategory['type'][]

const CREATE_CATEGORY_VALUE = '__create_category__'
const UNCATEGORIZED_VALUE = 'uncategorized'

const reviewStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  approved: { label: 'Approved', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  committed: { label: 'Committed', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
}

const flagStatusConfig: Record<StagingRow['flagStatus'], { label: string; className: string }> = {
  none: { label: '', className: '' },
  already_imported: { label: 'Already Imported', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  duplicate_in_file: { label: 'Duplicate in File', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
}

const sourceLabelMap: Record<string, string> = {
  knowledge_base: 'Learned',
  alias_resolution: 'Alias',
  genai_suggestion: 'AI',
  web_enriched: 'Web + AI',
  manual_override: 'Manual',
}

const groupIconMap: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ['salary', 'income', 'bonus'], icon: BriefcaseBusiness },
  { keywords: ['grocer', 'supermarket', 'market'], icon: ShoppingBasket },
  { keywords: ['eat', 'restaurant', 'food', 'dining'], icon: UtensilsCrossed },
  { keywords: ['transport', 'bus', 'mrt', 'taxi', 'commute'], icon: Bus },
  { keywords: ['travel', 'flight', 'hotel'], icon: Plane },
  { keywords: ['health', 'medical', 'insurance'], icon: HeartPulse },
  { keywords: ['home', 'housing', 'rent', 'mortgage'], icon: Home },
  { keywords: ['education', 'school', 'learning'], icon: GraduationCap },
  { keywords: ['shopping', 'retail'], icon: ShoppingBag },
  { keywords: ['bill', 'utility', 'subscription'], icon: ReceiptText },
  { keywords: ['tax', 'government'], icon: Landmark },
  { keywords: ['security', 'protection'], icon: ShieldCheck },
  { keywords: ['entertainment', 'fun', 'leisure'], icon: Ticket },
  { keywords: ['transfer'], icon: ArrowRightLeft },
]

function normalizeTxnDirection(txnType: string | null | undefined): 'credit' | 'debit' {
  return String(txnType).toLowerCase() === 'credit' ? 'credit' : 'debit'
}

function getCompatibleCategoryTypes(txnType: string | null | undefined): CategoryCompatibility {
  return normalizeTxnDirection(txnType) === 'credit' ? ['income', 'transfer'] : ['expense', 'transfer']
}

function isCategoryCompatible(category: ReviewCategory, txnType: string | null | undefined) {
  return getCompatibleCategoryTypes(txnType).includes(category.type ?? 'expense')
}

function getCompatibleCategories(categories: ReviewCategory[], txnType: string | null | undefined) {
  return categories.filter((category) => isCategoryCompatible(category, txnType))
}

function getGroupedCategories(categories: ReviewCategory[]) {
  const typeOrder: ReviewCategory['type'][] = ['income', 'expense', 'transfer']
  const typeLabels: Record<ReviewCategory['type'], string> = {
    income: 'Income Categories',
    expense: 'Expense Categories',
    transfer: 'Transfer Categories',
  }

  return typeOrder.map((type) => {
    const categoriesForType = categories
      .filter((category) => (category.type ?? 'expense') === type)
      .sort((left, right) => {
        const groupCompare = (left.group_name ?? 'Other').localeCompare(right.group_name ?? 'Other')
        return groupCompare !== 0 ? groupCompare : left.name.localeCompare(right.name)
      })

    const groups = Array.from(
      categoriesForType.reduce((map, category) => {
        const key = category.group_name ?? 'Other'
        const rows = map.get(key) ?? []
        rows.push(category)
        map.set(key, rows)
        return map
      }, new Map<string, ReviewCategory[]>()),
    )

    return {
      type,
      label: typeLabels[type],
      groups,
    }
  }).filter((group) => group.groups.length > 0)
}

function calculateStats(rows: StagingRow[]): Stats {
  return {
    total: rows.length,
    pending: rows.filter((row) => row.reviewStatus === 'pending').length,
    approved: rows.filter((row) => row.reviewStatus === 'approved').length,
    rejected: rows.filter((row) => row.reviewStatus === 'rejected').length,
    committed: rows.filter((row) => row.reviewStatus === 'committed').length,
    alreadyImported: rows.filter((row) => row.flagStatus === 'already_imported').length,
    duplicates: rows.filter((row) => row.flagStatus === 'duplicate_in_file').length,
    debitTotal: rows
      .filter((row) => normalizeTxnDirection(row.txnType) === 'debit' && row.reviewStatus !== 'rejected')
      .reduce((sum, row) => sum + Number(row.amount), 0),
    creditTotal: rows
      .filter((row) => normalizeTxnDirection(row.txnType) === 'credit' && row.reviewStatus !== 'rejected')
      .reduce((sum, row) => sum + Number(row.amount), 0),
  }
}

function pickCategoryIcon(category: Pick<ReviewCategory, 'name' | 'type' | 'group_name'>): LucideIcon {
  const haystack = `${category.group_name ?? ''} ${category.name}`.toLowerCase()
  for (const entry of groupIconMap) {
    if (entry.keywords.some((keyword) => haystack.includes(keyword))) {
      return entry.icon
    }
  }

  if (category.type === 'income') return CircleDollarSign
  if (category.type === 'transfer') return ArrowRightLeft
  return Wallet
}

function getBulkCompatibleCategories(selectedRows: StagingRow[], categories: ReviewCategory[]) {
  if (selectedRows.length === 0) return []

  return categories.filter((category) => selectedRows.every((row) => isCategoryCompatible(category, row.txnType)))
}

function insertCategorySorted(existing: ReviewCategory[], category: ReviewCategory) {
  const next = existing.filter((item) => item.id !== category.id).concat(category)
  return next.sort((left, right) => {
    const typeCompare = left.type.localeCompare(right.type)
    if (typeCompare !== 0) return typeCompare
    const groupCompare = (left.group_name ?? 'Other').localeCompare(right.group_name ?? 'Other')
    if (groupCompare !== 0) return groupCompare
    return left.name.localeCompare(right.name)
  })
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const importId = params.importId as string

  const [loading, setLoading] = useState(true)
  const [importMeta, setImportMeta] = useState<ImportMeta | null>(null)
  const [rows, setRows] = useState<StagingRow[]>([])
  const [categories, setCategories] = useState<ReviewCategory[]>([])

  const [filter, setFilter] = useState<FilterStatus>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft>({})
  const [savedRowIds, setSavedRowIds] = useState<Record<string, number>>({})
  const [bulkCategoryValue, setBulkCategoryValue] = useState<string>('')
  const [propagationDialog, setPropagationDialog] = useState<PendingPropagationDialog | null>(null)
  const [selectedPropagationIds, setSelectedPropagationIds] = useState<Set<string>>(new Set())

  const [actionLoading, setActionLoading] = useState(false)
  const [commitLoading, setCommitLoading] = useState(false)
  const { jobs: commitJobs, trackJob } = useStatementCommitJobs()
  const latestCommitJobStatusRef = useRef<string | null>(null)

  const fetchReviewData = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/statement/${importId}`)
      if (!res.ok) {
        toast.error('Failed to load review data')
        return
      }
      const data = await res.json()
      setImportMeta(data.import)
      setRows(data.rows)
      setCategories(data.categories ?? [])
    } catch {
      toast.error('Failed to load review data')
    } finally {
      setLoading(false)
    }
  }, [importId])

  useEffect(() => { void fetchReviewData() }, [fetchReviewData])

  const latestImportJob = useMemo(
    () => commitJobs.find((job) => job.importId === importId),
    [commitJobs, importId],
  )

  const commitJobActive = latestImportJob?.status === 'queued' || latestImportJob?.status === 'running'

  useEffect(() => {
    const status = latestImportJob?.status ?? null
    if (!status || latestCommitJobStatusRef.current === status) return

    latestCommitJobStatusRef.current = status
    if (status === 'succeeded' || status === 'failed') {
      void fetchReviewData()
    }
  }, [latestImportJob?.status, fetchReviewData])

  const stats = useMemo(() => calculateStats(rows), [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'duplicate') return rows.filter((row) => row.flagStatus === 'duplicate_in_file')
    if (filter === 'already_imported') return rows.filter((row) => row.flagStatus === 'already_imported')
    return rows.filter((row) => row.reviewStatus === filter)
  }, [rows, filter])

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds],
  )

  const bulkCompatibleCategories = useMemo(
    () => getBulkCompatibleCategories(selectedRows, categories),
    [selectedRows, categories],
  )

  const bulkGroupedCategories = useMemo(
    () => getGroupedCategories(bulkCompatibleCategories),
    [bulkCompatibleCategories],
  )

  const editTxnType = editDraft.txnType ?? rows.find((row) => row.id === editingRowId)?.txnType ?? 'debit'
  const compatibleEditCategories = useMemo(
    () => getCompatibleCategories(categories, editTxnType),
    [categories, editTxnType],
  )
  const groupedEditCategories = useMemo(
    () => getGroupedCategories(compatibleEditCategories),
    [compatibleEditCategories],
  )

  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id))
  const someFilteredSelected = filteredRows.some((row) => selectedIds.has(row.id))
  const bulkCategoryDisabled = selectedRows.length === 0 || bulkCompatibleCategories.length === 0

  const propagationTargets = propagationDialog
    ? [...propagationDialog.preview.preselectedTargets, ...propagationDialog.preview.optionalTargets]
    : []

  function markRowsSaved(rowIds: string[]) {
    const timestamp = Date.now()
    setSavedRowIds((previous) => {
      const next = { ...previous }
      rowIds.forEach((rowId) => {
        next[rowId] = timestamp
      })
      return next
    })

    window.setTimeout(() => {
      setSavedRowIds((previous) => {
        const next = { ...previous }
        rowIds.forEach((rowId) => {
          if (next[rowId] === timestamp) {
            delete next[rowId]
          }
        })
        return next
      })
    }, 1800)
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((previous) => {
        const next = new Set(previous)
        filteredRows.forEach((row) => next.delete(row.id))
        return next
      })
    } else {
      setSelectedIds((previous) => {
        const next = new Set(previous)
        filteredRows.forEach((row) => next.add(row.id))
        return next
      })
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkAction(reviewStatus: 'approved' | 'rejected') {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('No rows selected')
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: ids, reviewStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to update rows')
        return
      }

      setRows((previous) => previous.map((row) => (
        ids.includes(row.id)
          ? { ...row, reviewStatus }
          : row
      )))
      setSelectedIds(new Set())
      setBulkCategoryValue('')
      markRowsSaved(ids)
      toast.success(`${ids.length} row(s) ${reviewStatus}`)
    } catch {
      toast.error('Failed to update rows')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRowAction(rowId: string, reviewStatus: 'approved' | 'rejected') {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowIds: [rowId], reviewStatus }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to update row')
        return
      }

      setRows((previous) => previous.map((row) => (
        row.id === rowId
          ? { ...row, reviewStatus }
          : row
      )))
      markRowsSaved([rowId])
      toast.success(`Row ${reviewStatus}`)
    } catch {
      toast.error('Failed to update row')
    } finally {
      setActionLoading(false)
    }
  }

  async function applyBulkCategory() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.error('No rows selected')
      return
    }

    if (!bulkCategoryValue) {
      toast.error('Choose a category first')
      return
    }

    const selectedCategory = bulkCategoryValue === UNCATEGORIZED_VALUE
      ? null
      : bulkCompatibleCategories.find((category) => String(category.id) === bulkCategoryValue)

    if (bulkCategoryValue !== UNCATEGORIZED_VALUE && !selectedCategory) {
      toast.error('Selected category is not available for these rows')
      return
    }

    setActionLoading(true)
    try {
      const updates = ids.map((id) => ({
        id,
        fields: {
          categoryId: selectedCategory?.id ?? null,
        },
      }))

      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to update selected rows')
        return
      }

      setRows((previous) => previous.map((row) => {
        if (!ids.includes(row.id)) return row
        return {
          ...row,
          categoryId: selectedCategory?.id ?? null,
          categoryName: selectedCategory?.name ?? null,
          categoryDecisionSource: 'manual_override',
          categoryConfidence: 1,
          isEdited: true,
        }
      }))
      setSelectedIds(new Set())
      setBulkCategoryValue('')
      markRowsSaved(ids)
      toast.success(`Updated ${data.updatedCount ?? ids.length} selected row(s)`) 
    } catch {
      toast.error('Failed to update selected rows')
    } finally {
      setActionLoading(false)
    }
  }

  function startEdit(row: StagingRow) {
    setEditingRowId(row.id)
    setEditDraft({
      txnDate: row.txnDate,
      merchantRaw: row.merchantRaw,
      description: row.description,
      amount: row.amount,
      txnType: row.txnType,
      currency: row.currency,
      reference: row.reference,
      categoryId: row.categoryId,
      createCategoryMode: false,
      newCategoryName: '',
      newCategoryGroupName: row.categoryName ? '' : row.originalData.categoryGroupName as string | undefined,
    })
  }

  function cancelEdit() {
    setEditingRowId(null)
    setEditDraft({})
  }

  async function persistRowEdit(rowId: string, fields: Record<string, unknown>, applyToRowIds: string[] = []) {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/rows`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ id: rowId, fields, applyToRowIds }],
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save edit')
        return false
      }

      const resolvedCategory = data.resolvedCategory
        ? {
            id: Number(data.resolvedCategory.id),
            name: String(data.resolvedCategory.name),
            type: String(data.resolvedCategory.type ?? 'expense') as ReviewCategory['type'],
            group_name: data.resolvedCategory.group_name ? String(data.resolvedCategory.group_name) : null,
          }
        : data.resolvedCategory === null
          ? null
          : undefined

      if (resolvedCategory) {
        setCategories((previous) => insertCategorySorted(previous, resolvedCategory))
      }

      const updatedIds: string[] = Array.isArray(data.updatedRowIds) && data.updatedRowIds.length > 0
        ? data.updatedRowIds.map((value: unknown) => String(value))
        : [rowId]

      setRows((previous) => previous.map((candidate) => {
        if (!updatedIds.includes(candidate.id)) return candidate

        const isPrimaryRow = candidate.id === rowId
        return {
          ...candidate,
          txnDate: isPrimaryRow && fields.txn_date ? String(fields.txn_date) : candidate.txnDate,
          merchantRaw: isPrimaryRow && fields.merchant_raw ? String(fields.merchant_raw) : candidate.merchantRaw,
          description: isPrimaryRow && Object.prototype.hasOwnProperty.call(fields, 'description')
            ? (fields.description as string | null)
            : candidate.description,
          amount: isPrimaryRow && fields.amount !== undefined ? Number(fields.amount) : candidate.amount,
          txnType: isPrimaryRow && fields.txn_type ? String(fields.txn_type) : candidate.txnType,
          currency: isPrimaryRow && fields.currency ? String(fields.currency) : candidate.currency,
          reference: isPrimaryRow && Object.prototype.hasOwnProperty.call(fields, 'reference')
            ? (fields.reference as string | null)
            : candidate.reference,
          categoryId: resolvedCategory === undefined ? candidate.categoryId : resolvedCategory?.id ?? null,
          categoryName: resolvedCategory === undefined ? candidate.categoryName : resolvedCategory?.name ?? null,
          categoryDecisionSource: resolvedCategory === undefined ? candidate.categoryDecisionSource : 'manual_override',
          categoryConfidence: resolvedCategory === undefined ? candidate.categoryConfidence : 1,
          isEdited: true,
        }
      }))

      markRowsSaved(updatedIds)

      if (Array.isArray(data.skippedTargets) && data.skippedTargets.length > 0) {
        toast.success('Saved source row. Some related rows were skipped.')
      } else if (applyToRowIds.length > 0 && data.updatedCount > 1) {
        toast.success(`Updated ${data.updatedCount - 1} related row(s) and saved the source row`)
      } else {
        toast.success('Saved')
      }

      cancelEdit()
      return true
    } catch {
      toast.error('Failed to save edit')
      return false
    } finally {
      setActionLoading(false)
    }
  }

  async function saveEdit(rowId: string) {
    const row = rows.find((candidate) => candidate.id === rowId)
    if (!row) return

    const fields: Record<string, unknown> = {}

    if (editDraft.txnDate !== undefined && editDraft.txnDate !== row.txnDate) fields.txn_date = editDraft.txnDate
    if (editDraft.merchantRaw !== undefined && editDraft.merchantRaw !== row.merchantRaw) fields.merchant_raw = editDraft.merchantRaw
    if (editDraft.description !== undefined && editDraft.description !== row.description) fields.description = editDraft.description || null
    if (editDraft.amount !== undefined && editDraft.amount !== row.amount) fields.amount = editDraft.amount
    if (editDraft.txnType !== undefined && editDraft.txnType !== row.txnType) fields.txn_type = editDraft.txnType
    if (editDraft.currency !== undefined && editDraft.currency !== row.currency) fields.currency = editDraft.currency
    if (editDraft.reference !== undefined && editDraft.reference !== row.reference) fields.reference = editDraft.reference || null

    if (editDraft.createCategoryMode) {
      const newCategoryName = editDraft.newCategoryName?.trim()
      if (!newCategoryName) {
        toast.error('Enter a category name')
        return
      }
      fields.newCategoryName = newCategoryName
      fields.newCategoryGroupName = editDraft.newCategoryGroupName?.trim() || null
    } else if (editDraft.categoryId !== undefined && editDraft.categoryId !== row.categoryId) {
      fields.categoryId = editDraft.categoryId ?? null
    }

    if (Object.keys(fields).length === 0) {
      cancelEdit()
      return
    }

    const categoryChanged = Object.prototype.hasOwnProperty.call(fields, 'categoryId') || Object.prototype.hasOwnProperty.call(fields, 'newCategoryName')
    if (!categoryChanged) {
      await persistRowEdit(rowId, fields)
      return
    }

    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/rows/preview-propagation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId, fields }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to preview related rows')
        return
      }

      const totalCandidates = (data.preselectedTargets?.length ?? 0) + (data.optionalTargets?.length ?? 0) + (data.excludedTargets?.length ?? 0)
      if (totalCandidates === 0) {
        await persistRowEdit(rowId, fields)
        return
      }

      setPropagationDialog({
        rowId,
        fields,
        preview: data as PropagationPreviewResponse,
      })
      setSelectedPropagationIds(new Set((data.preselectedTargets ?? []).map((target: PropagationPreviewTarget) => target.rowId)))
    } catch {
      toast.error('Failed to preview related rows')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSaveSourceOnly() {
    if (!propagationDialog) return
    const { rowId, fields } = propagationDialog
    setPropagationDialog(null)
    setSelectedPropagationIds(new Set())
    await persistRowEdit(rowId, fields, [])
  }

  async function handleApplyPropagationSelection() {
    if (!propagationDialog) return
    const { rowId, fields } = propagationDialog
    const selectedIds = Array.from(selectedPropagationIds)
    setPropagationDialog(null)
    setSelectedPropagationIds(new Set())
    await persistRowEdit(rowId, fields, selectedIds)
  }


  async function handleCommit() {
    if (stats.approved === 0) {
      toast.error('No approved rows to commit')
      return
    }

    const confirmed = window.confirm(
      `Start a background commit for ${stats.approved} approved transaction(s)?

You can leave this page while the commit continues.`,
    )
    if (!confirmed) return

    setCommitLoading(true)
    try {
      const res = await fetch('/api/ai/statement/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Failed to start commit')
        return
      }

      if (data.job) {
        trackJob(data.job)
      }
    } catch {
      toast.error('Failed to start commit')
    } finally {
      setCommitLoading(false)
    }
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!importMeta) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Import not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push('/statements')}>
          <ArrowLeft className="mr-2 size-4" />
          Back to Statements
        </Button>
      </div>
    )
  }

  const isReadOnly = importMeta.status !== 'in_review' || commitJobActive
  const currency = importMeta.currency || 'SGD'

  async function handleReopen() {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/ai/statement/${importId}/reopen`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to reopen import')
        return
      }
      toast.success('Import reopened for editing')
      await fetchReviewData()
    } catch {
      toast.error('Failed to reopen import')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/statements')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Review Import</h1>
            <p className="text-sm text-muted-foreground">
              {importMeta.fileName}
              {importMeta.institutionCode && ` · ${importMeta.institutionCode}`}
              {importMeta.statementDate && ` · ${formatDate(importMeta.statementDate)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {importMeta.canReopen && (
            <Button
              variant="outline"
              onClick={() => void handleReopen()}
              disabled={actionLoading || commitJobActive}
              className="gap-2"
            >
              <Pencil className="size-4" />
              Reopen for Editing
            </Button>
          )}
          {!isReadOnly && (
            <Button
              onClick={handleCommit}
              disabled={commitLoading || commitJobActive || stats.approved === 0}
              className="gap-2"
            >
              {commitLoading || commitJobActive ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {commitJobActive ? 'Commit Running' : importMeta.isRevision ? 'Re-Commit' : 'Commit'} {stats.approved} Approved
            </Button>
          )}
        </div>
      </div>

      {importMeta.isRevision && (
        <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20">
          <CardContent className="py-3 text-sm text-muted-foreground">
            Revision mode is active. The currently committed transactions remain live until this replacement commit succeeds.
          </CardContent>
        </Card>
      )}

      {commitJobActive && latestImportJob && (
        <Card className="border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/20">
          <CardContent className="flex items-center gap-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-indigo-500" />
            Background commit is running for this import. You can leave this page and the app will notify you when it finishes.
          </CardContent>
        </Card>
      )}

      {latestImportJob?.status === 'failed' && (
        <Card className="border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20">
          <CardContent className="py-3 text-sm text-red-700 dark:text-red-300">
            The last background commit failed: {latestImportJob.error ?? 'Commit failed'}
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(propagationDialog)} onOpenChange={() => undefined}>
        <DialogContent
          className="max-w-3xl"
          showCloseButton={false}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Apply category to related rows</DialogTitle>
            <DialogDescription>
              Review the related transactions below. Only the checked rows will receive the same category update.
            </DialogDescription>
          </DialogHeader>

          {propagationDialog && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">Source row: {propagationDialog.preview.sourceRow.merchantRaw}</p>
                    <p className="text-xs text-muted-foreground">
                      {propagationDialog.preview.sourceRow.accountLabel ?? 'Unknown account'} · Row {propagationDialog.preview.sourceRow.rowIndex + 1}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={propagationDialog.preview.sourceRow.txnType === 'credit' ? 'default' : 'secondary'} className="text-xs">
                      {propagationDialog.preview.sourceRow.txnType}
                    </Badge>
                    <p className="mt-1 text-sm font-medium">
                      {formatCurrency(Math.abs(propagationDialog.preview.sourceRow.amount), rows.find((row) => row.id === propagationDialog.rowId)?.currency || importMeta.currency || 'SGD')}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Proposed category: {propagationDialog.preview.resolvedCategory?.name ?? 'Uncategorized'}
                </p>
              </div>

              <div className="max-h-[420px] space-y-4 overflow-y-auto pr-1">
                {propagationTargets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Selectable related rows</p>
                    <div className="space-y-2">
                      {propagationTargets.map((target) => (
                        <label key={target.rowId} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
                          <Checkbox
                            checked={selectedPropagationIds.has(target.rowId)}
                            onCheckedChange={(checked) => {
                              setSelectedPropagationIds((previous) => {
                                const next = new Set(previous)
                                if (checked) next.add(target.rowId)
                                else next.delete(target.rowId)
                                return next
                              })
                            }}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">{target.merchantRaw}</p>
                                <p className="text-xs text-muted-foreground">
                                  {target.accountLabel ?? 'Unknown account'} · Row {target.rowIndex + 1}
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge variant={target.txnType === 'credit' ? 'default' : 'secondary'} className="text-xs">
                                  {target.txnType}
                                </Badge>
                                <p className="mt-1 text-sm font-medium">
                                  {target.txnType === 'credit' ? '+' : '-'}{formatCurrency(Math.abs(target.amount), rows.find((row) => row.id === target.rowId)?.currency || importMeta.currency || 'SGD')}
                                </p>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Current: {target.currentCategoryName ?? 'Uncategorized'} → Proposed: {target.proposedCategoryName ?? 'Uncategorized'}
                            </p>
                            <p className="text-xs text-muted-foreground">{target.reason}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {propagationDialog.preview.excludedTargets.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Excluded rows</p>
                    <div className="space-y-2">
                      {propagationDialog.preview.excludedTargets.map((target) => (
                        <div key={target.rowId} className="rounded-lg border border-dashed p-3 opacity-75">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{target.merchantRaw}</p>
                              <p className="text-xs text-muted-foreground">
                                {target.accountLabel ?? 'Unknown account'} · Row {target.rowIndex + 1}
                              </p>
                            </div>
                            <Badge variant={target.txnType === 'credit' ? 'default' : 'secondary'} className="text-xs">
                              {target.txnType}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">{target.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => void handleSaveSourceOnly()} disabled={actionLoading}>
              Save Source Only
            </Button>
            <Button onClick={() => void handleApplyPropagationSelection()} disabled={actionLoading}>
              Apply to Selected Rows
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} className="text-yellow-600" />
        <StatCard label="Approved" value={stats.approved} className="text-green-600" />
        <StatCard label="Rejected" value={stats.rejected} className="text-red-600" />
        <StatCard label="Committed" value={stats.committed} className="text-emerald-600" />
        <StatCard label="Already Imported" value={stats.alreadyImported} className="text-sky-600" />
        <StatCard label="Dup in File" value={stats.duplicates} className="text-orange-600" />
        <StatCard label="Debits" value={formatCurrency(stats.debitTotal, currency)} isText />
        <StatCard label="Credits" value={formatCurrency(stats.creditTotal, currency)} isText className="text-green-600" />
      </div>

      <Card>
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={(value) => { setFilter(value as FilterStatus); setSelectedIds(new Set()) }}>
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rows</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="committed">Committed</SelectItem>
                  <SelectItem value="already_imported">Already Imported</SelectItem>
                  <SelectItem value="duplicate">Duplicate in File</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                {filteredRows.length} row{filteredRows.length !== 1 ? 's' : ''}
                {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
              </span>
            </div>

            {!isReadOnly && selectedIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={bulkCategoryValue} onValueChange={setBulkCategoryValue} disabled={bulkCategoryDisabled || actionLoading}>
                  <SelectTrigger className="h-8 w-[220px] text-xs">
                    <SelectValue placeholder={bulkCategoryDisabled ? 'Mixed directions selected' : 'Bulk category'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNCATEGORIZED_VALUE}>Uncategorized</SelectItem>
                    {bulkGroupedCategories.map((typeGroup, typeIndex) => (
                      <div key={typeGroup.type}>
                        {typeIndex > 0 && <SelectSeparator />}
                        <SelectGroup>
                          <SelectLabel>{typeGroup.label}</SelectLabel>
                          {typeGroup.groups.map(([groupName, groupCategories]) => (
                            <div key={`${typeGroup.type}:${groupName}`}>
                              <SelectLabel className="pl-4 text-[11px]">{groupName}</SelectLabel>
                              {groupCategories.map((category) => {
                                const Icon = pickCategoryIcon(category)
                                return (
                                  <SelectItem key={category.id} value={String(category.id)}>
                                    <span className="flex items-center gap-2">
                                      <Icon className="size-3.5 text-muted-foreground" />
                                      <span>{category.name}</span>
                                    </span>
                                  </SelectItem>
                                )
                              })}
                            </div>
                          ))}
                        </SelectGroup>
                      </div>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  onClick={() => void applyBulkCategory()}
                  disabled={actionLoading || !bulkCategoryValue || bulkCategoryDisabled}
                >
                  <Check className="size-3" />
                  Apply Category
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  onClick={() => void handleBulkAction('approved')}
                  disabled={actionLoading}
                >
                  <CheckCircle2 className="size-3" />
                  Approve Selected
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs text-red-600 hover:text-red-700"
                  onClick={() => void handleBulkAction('rejected')}
                  disabled={actionLoading}
                >
                  <XCircle className="size-3" />
                  Reject Selected
                </Button>
              </div>
            )}

            {!isReadOnly && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                    Bulk Actions
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => {
                    const pendingIds = rows.filter((row) => row.reviewStatus === 'pending').map((row) => row.id)
                    setSelectedIds(new Set(pendingIds))
                  }}>
                    Select All Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    const nonDupIds = rows
                      .filter((row) => row.flagStatus === 'none' && row.reviewStatus === 'pending')
                      .map((row) => row.id)
                    setSelectedIds(new Set(nonDupIds))
                  }}>
                    Select New Pending
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSelectedIds(new Set())}>
                    Clear Selection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Parsed Transactions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 bg-background">
                {!isReadOnly && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      {...(someFilteredSelected && !allFilteredSelected ? { 'data-state': 'indeterminate' } : {})}
                    />
                  </TableHead>
                )}
                <TableHead className="w-8">#</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Merchant / Description</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Flags</TableHead>
                {!isReadOnly && <TableHead className="w-24">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => {
                const isEditing = editingRowId === row.id
                const statusCfg = reviewStatusConfig[row.reviewStatus] ?? reviewStatusConfig.pending
                const dupCfg = flagStatusConfig[row.flagStatus]
                const sourceLabel = row.categoryDecisionSource ? sourceLabelMap[row.categoryDecisionSource] ?? row.categoryDecisionSource : null
                const currentCategory = categories.find((category) => category.id === row.categoryId)
                const CategoryIcon = pickCategoryIcon(currentCategory ?? {
                  id: row.categoryId ?? -1,
                  name: row.categoryName ?? 'Uncategorized',
                  type: normalizeTxnDirection(row.txnType) === 'credit' ? 'income' : 'expense',
                  group_name: null,
                })

                return (
                  <TableRow
                    key={row.id}
                    className={cn(
                      row.reviewStatus === 'rejected' && 'opacity-50',
                      row.reviewStatus === 'approved' && 'bg-green-50/50 dark:bg-green-950/10',
                      row.flagStatus === 'already_imported' && row.reviewStatus === 'pending' && 'bg-sky-50/50 dark:bg-sky-950/10',
                      row.flagStatus === 'duplicate_in_file' && row.reviewStatus === 'pending' && 'bg-orange-50/50 dark:bg-orange-950/10',
                    )}
                    data-state={selectedIds.has(row.id) ? 'selected' : undefined}
                  >
                    {!isReadOnly && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(row.id)}
                          onCheckedChange={() => toggleSelect(row.id)}
                          aria-label={`Select row ${row.rowIndex + 1}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">{row.rowIndex + 1}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {isEditing ? (
                        <Input
                          type="date"
                          value={editDraft.txnDate ?? ''}
                          onChange={(event) => setEditDraft((draft) => ({ ...draft, txnDate: event.target.value }))}
                          className="h-7 w-32 text-xs"
                        />
                      ) : (
                        <span className="text-sm">{row.txnDate}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Input
                            value={editDraft.merchantRaw ?? ''}
                            onChange={(event) => setEditDraft((draft) => ({ ...draft, merchantRaw: event.target.value }))}
                            className="h-7 text-xs"
                            placeholder="Merchant"
                          />
                          <Input
                            value={editDraft.description ?? ''}
                            onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))}
                            className="h-7 text-xs"
                            placeholder="Description (optional)"
                          />
                        </div>
                      ) : (
                        <div>
                          <span className="block truncate text-sm font-medium">{row.merchantRaw}</span>
                          {row.description && row.description !== row.merchantRaw && (
                            <span className="block truncate text-xs text-muted-foreground">{row.description}</span>
                          )}
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {row.accountLabel ?? 'Unknown account'}
                            {row.merchantBusinessType ? ` · ${row.merchantBusinessType}` : ''}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="space-y-2">
                          <Select
                            value={editDraft.createCategoryMode ? CREATE_CATEGORY_VALUE : editDraft.categoryId != null ? String(editDraft.categoryId) : UNCATEGORIZED_VALUE}
                            onValueChange={(value) => {
                              if (value === CREATE_CATEGORY_VALUE) {
                                setEditDraft((draft) => ({
                                  ...draft,
                                  createCategoryMode: true,
                                  categoryId: null,
                                }))
                                return
                              }

                              setEditDraft((draft) => ({
                                ...draft,
                                createCategoryMode: false,
                                categoryId: value === UNCATEGORIZED_VALUE ? null : Number(value),
                              }))
                            }}
                          >
                            <SelectTrigger className="h-7 w-[220px] text-xs">
                              <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNCATEGORIZED_VALUE}>Uncategorized</SelectItem>
                              <SelectItem value={CREATE_CATEGORY_VALUE}>
                                <span className="flex items-center gap-2">
                                  <Plus className="size-3.5 text-muted-foreground" />
                                  <span>Create new category</span>
                                </span>
                              </SelectItem>
                              {groupedEditCategories.map((typeGroup, typeIndex) => (
                                <div key={typeGroup.type}>
                                  {typeIndex > 0 && <SelectSeparator />}
                                  <SelectGroup>
                                    <SelectLabel>{typeGroup.label}</SelectLabel>
                                    {typeGroup.groups.map(([groupName, groupCategories]) => (
                                      <div key={`${typeGroup.type}:${groupName}`}>
                                        <SelectLabel className="pl-4 text-[11px]">{groupName}</SelectLabel>
                                        {groupCategories.map((category) => {
                                          const Icon = pickCategoryIcon(category)
                                          return (
                                            <SelectItem key={category.id} value={String(category.id)}>
                                              <span className="flex items-center gap-2">
                                                <Icon className="size-3.5 text-muted-foreground" />
                                                <span>{category.name}</span>
                                              </span>
                                            </SelectItem>
                                          )
                                        })}
                                      </div>
                                    ))}
                                  </SelectGroup>
                                </div>
                              ))}
                            </SelectContent>
                          </Select>
                          {editDraft.createCategoryMode && (
                            <div className="space-y-1 rounded-md border border-dashed p-2">
                              <Input
                                value={editDraft.newCategoryName ?? ''}
                                onChange={(event) => setEditDraft((draft) => ({ ...draft, newCategoryName: event.target.value }))}
                                className="h-7 text-xs"
                                placeholder={normalizeTxnDirection(editTxnType) === 'credit' ? 'New income category name' : 'New expense category name'}
                              />
                              <Input
                                value={editDraft.newCategoryGroupName ?? ''}
                                onChange={(event) => setEditDraft((draft) => ({ ...draft, newCategoryGroupName: event.target.value }))}
                                className="h-7 text-xs"
                                placeholder="Group name (optional)"
                              />
                              <p className="text-[11px] text-muted-foreground">
                                This will be saved as an {normalizeTxnDirection(editTxnType) === 'credit' ? 'income' : 'expense'} category for future reuse.
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <CategoryIcon className="size-3.5 text-muted-foreground" />
                            <span>{row.categoryName ?? 'Uncategorized'}</span>
                          </span>
                          {(sourceLabel || row.categoryConfidence != null) && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Sparkles className="size-3" />
                              {sourceLabel ?? 'Suggestion'}
                              {row.categoryConfidence != null ? ` · ${Math.round(row.categoryConfidence * 100)}%` : ''}
                            </span>
                          )}
                          {row.similarMerchantCount > 0 && (
                            <span className="block text-[11px] text-muted-foreground">
                              {row.similarMerchantCount} related row{row.similarMerchantCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Select value={editDraft.txnType} onValueChange={(value) => setEditDraft((draft) => ({
                          ...draft,
                          txnType: value,
                          createCategoryMode: false,
                          newCategoryName: '',
                          newCategoryGroupName: '',
                          categoryId: isCategoryCompatible(
                            categories.find((category) => category.id === draft.categoryId) ?? { id: -1, name: '', type: 'expense', group_name: null },
                            value,
                          ) ? draft.categoryId : null,
                        }))}>
                          <SelectTrigger className="h-7 w-20 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="debit">Debit</SelectItem>
                            <SelectItem value="credit">Credit</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={row.txnType === 'credit' ? 'default' : 'secondary'} className="text-xs">
                          {row.txnType}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editDraft.amount ?? ''}
                          onChange={(event) => setEditDraft((draft) => ({ ...draft, amount: parseFloat(event.target.value) || 0 }))}
                          className="h-7 w-28 text-right text-xs"
                        />
                      ) : (
                        <span
                          className={cn(
                            'font-medium tabular-nums text-sm',
                            row.txnType === 'credit' ? 'text-green-600' : 'text-foreground',
                          )}
                        >
                          {row.txnType === 'credit' ? '+' : '-'}
                          {formatCurrency(Math.abs(row.amount), row.currency)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge className={cn('border-0 text-xs', statusCfg.className)}>
                          {statusCfg.label}
                        </Badge>
                        {row.isEdited && (
                          <Badge variant="outline" className="gap-0.5 text-xs">
                            <Pencil className="size-2.5" />
                            edited
                          </Badge>
                        )}
                        {savedRowIds[row.id] && (
                          <Badge variant="outline" className="gap-0.5 border-emerald-200 text-emerald-600">
                            <Check className="size-3" />
                            saved
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.flagStatus !== 'none' && (
                        <Badge className={cn('gap-1 border-0 text-xs', dupCfg.className)}>
                          <Copy className="size-2.5" />
                          {dupCfg.label}
                        </Badge>
                      )}
                      {row.flagStatus === 'already_imported' && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Matches a transaction already committed from this statement history.
                        </p>
                      )}
                    </TableCell>
                    {!isReadOnly && (
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0 text-green-600"
                              onClick={() => void saveEdit(row.id)}
                              disabled={actionLoading}
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0"
                              onClick={cancelEdit}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            {row.reviewStatus !== 'committed' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-7 p-0"
                                  onClick={() => startEdit(row)}
                                  title="Edit"
                                >
                                  <Pencil className="size-3" />
                                </Button>
                                {row.reviewStatus !== 'approved' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-7 p-0 text-green-600"
                                    onClick={() => void handleRowAction(row.id, 'approved')}
                                    disabled={actionLoading}
                                    title="Approve"
                                  >
                                    <CheckCircle2 className="size-3.5" />
                                  </Button>
                                )}
                                {row.reviewStatus !== 'rejected' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-7 p-0 text-red-600"
                                    onClick={() => void handleRowAction(row.id, 'rejected')}
                                    disabled={actionLoading}
                                    title="Reject"
                                  >
                                    <XCircle className="size-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isReadOnly ? 9 : 10} className="py-8 text-center text-muted-foreground">
                    No rows match the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {importMeta.summary && Object.keys(importMeta.summary).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Statement Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
              {Object.entries(importMeta.summary).map(([key, value]) => (
                value != null && (
                  <div key={key}>
                    <dt className="text-xs capitalize text-muted-foreground">{key.replace(/_/g, ' ')}</dt>
                    <dd className="font-medium">{typeof value === 'number' ? formatCurrency(value, currency) : String(value)}</dd>
                  </div>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, className, isText }: { label: string; value: number | string; className?: string; isText?: boolean }) {
  return (
    <Card>
      <CardContent className="px-4 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-lg font-bold tabular-nums', className)}>
          {isText ? value : value}
        </p>
      </CardContent>
    </Card>
  )
}
