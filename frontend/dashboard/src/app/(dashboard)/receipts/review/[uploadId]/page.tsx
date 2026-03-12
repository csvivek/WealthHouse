'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Bot, CheckCircle2, Loader2, RefreshCw, Save, Search, Sparkles, Unlink2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { CategoryBadge } from '@/components/category-badge'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { TagSelector } from '@/components/tag-selector'

interface ReceiptUpload {
  id: string
  status: string
  original_filename: string
  parse_error: string | null
  committed_receipt_id: string | null
  created_at: string
}

interface StagingHeader {
  id: string
  merchant_name: string | null
  txn_date: string | null
  payment_time: string | null
  transaction_total: number | null
  payment_information: string | null
  payment_type: string | null
  payment_breakdown_json: Record<string, number> | null
  receipt_reference: string | null
  tax_amount: number | null
  currency: string
  notes: string | null
  confidence_warnings_json: string[]
  extraction_confidence: number | null
  classification_confidence: number | null
  classification_source: string | null
  receipt_category_id: string | null
  is_mixed_basket: boolean
  user_confirmed_low_confidence: boolean
  tag_ids_json: string[]
  tag_suggestions_json: Array<{
    tagId: string | null
    name: string
    confidence: number
    reason: string
    source: string
  }>
}

interface StagingItem {
  id: string
  line_number: number
  item_name: string | null
  quantity: number | null
  unit_price: number | null
  line_total: number | null
  line_discount: number | null
  receipt_category_id: string | null
  classification_source: string | null
  classification_confidence: number | null
}

interface DuplicateCandidate {
  id: string
  score: number
  status: string
  candidate_receipt_id: string | null
  signals_json: Record<string, unknown>
}

interface ReceiptCategory {
  id: string
  name: string
  category_family: string | null
  icon_key?: string | null
  color_token?: string | null
  color_hex?: string | null
  domain_type?: string | null
  payment_subtype?: string | null
}

interface ChatSuggestion {
  action?: 'set_field' | 'set_item_category' | 'set_header_category'
  target: 'header' | 'item'
  itemId?: string
  field: string
  value: string | number | boolean | null
  targetCategoryName?: string | null
  targetCategoryId?: string | null
  createCategoryIfMissing?: boolean
  reason?: string
  confidence?: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  suggestions?: ChatSuggestion[]
}

interface StatementMatchCandidate {
  statementTransactionId: string
  txnDate: string
  merchantRaw: string | null
  description: string | null
  amount: number
  currency: string
  txnType: string
  confidence: number
  signals: {
    amountScore: number
    dateScore: number
    merchantScore: number
    windowDays: number
    purchasePreferred: boolean
    merchantExact: boolean
    merchantTokenOverlap: number
    amountDelta: number
  }
  existingMappingId: string | null
  existingMappingStatus: 'needs_review' | 'confirmed' | 'rejected' | null
}

interface ExistingMapping {
  id: string
  statementTransactionId: string
  status: 'needs_review' | 'confirmed' | 'rejected'
  matchScore: number
  matchType: string
  notes: string | null
  matchReason: Record<string, unknown> | null
  reviewedAt: string | null
  updatedAt: string | null
  createdAt: string
  statementTransaction: {
    id: string
    txnDate: string
    merchantRaw: string | null
    description: string | null
    amount: number
    currency: string
    txnType: string
  }
}

function pct(value: number | null | undefined) {
  return `${Math.round((value ?? 0) * 100)}%`
}

export default function ReceiptReviewPage() {
  const params = useParams()
  const router = useRouter()
  const uploadId = params.uploadId as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [approving, setApproving] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [chatting, setChatting] = useState(false)

  const [upload, setUpload] = useState<ReceiptUpload | null>(null)
  const [staging, setStaging] = useState<StagingHeader | null>(null)
  const [items, setItems] = useState<StagingItem[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [categories, setCategories] = useState<ReceiptCategory[]>([])
  const [tags, setTags] = useState<TagPresentation[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [applyingSuggestionKey, setApplyingSuggestionKey] = useState<string | null>(null)

  const [matchLoading, setMatchLoading] = useState(false)
  const [linkingTxnId, setLinkingTxnId] = useState<string | null>(null)
  const [updatingMappingId, setUpdatingMappingId] = useState<string | null>(null)
  const [autoSuggestion, setAutoSuggestion] = useState<StatementMatchCandidate | null>(null)
  const [manualCandidates, setManualCandidates] = useState<StatementMatchCandidate[]>([])
  const [existingMappings, setExistingMappings] = useState<ExistingMapping[]>([])
  const [matchWindow, setMatchWindow] = useState<{ from: string; to: string } | null>(null)
  const [matchInfoMessage, setMatchInfoMessage] = useState<string | null>(null)
  const [manualPickerOpened, setManualPickerOpened] = useState(false)
  const [mappingNotes, setMappingNotes] = useState<Record<string, string>>({})

  const fetchReview = useCallback(async () => {
    try {
      const response = await fetch(`/api/receipts/review/${uploadId}`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = await response.json() as {
        upload: ReceiptUpload
        staging: StagingHeader | null
        items: StagingItem[]
        duplicates: DuplicateCandidate[]
        categories: ReceiptCategory[]
        tags: TagPresentation[]
      }

      setUpload(payload.upload)
      setStaging(payload.staging)
      setItems(payload.items ?? [])
      setDuplicates(payload.duplicates ?? [])
      setCategories(payload.categories ?? [])
      setTags(payload.tags ?? [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load review data')
    } finally {
      setLoading(false)
    }
  }, [uploadId])

  const fetchMatchCandidates = useCallback(async (showNoMatchToast = false) => {
    const receiptId = upload?.committed_receipt_id
    if (!receiptId) {
      setAutoSuggestion(null)
      setManualCandidates([])
      setExistingMappings([])
      setMatchInfoMessage(null)
      setMatchWindow(null)
      return
    }

    setMatchLoading(true)
    try {
      const response = await fetch(`/api/receipts/${receiptId}/matches/candidates`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = await response.json() as {
        matchingWindow: { from: string; to: string }
        autoSuggestion: StatementMatchCandidate | null
        candidates: StatementMatchCandidate[]
        existingMappings: ExistingMapping[]
        noMatchMessage: string | null
      }

      setMatchWindow(payload.matchingWindow)
      setAutoSuggestion(payload.autoSuggestion)
      setManualCandidates(payload.candidates ?? [])
      setExistingMappings(payload.existingMappings ?? [])
      setMatchInfoMessage(payload.noMatchMessage)

      setMappingNotes(() => {
        const next: Record<string, string> = {}
        for (const mapping of payload.existingMappings ?? []) {
          next[mapping.id] = mapping.notes ?? ''
        }
        return next
      })

      if (showNoMatchToast && !payload.autoSuggestion && (payload.candidates?.length ?? 0) === 0) {
        toast.message(payload.noMatchMessage || 'No candidate transactions found in the current match window.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load statement match candidates')
    } finally {
      setMatchLoading(false)
    }
  }, [upload?.committed_receipt_id])

  useEffect(() => {
    void fetchReview()
  }, [fetchReview])

  useEffect(() => {
    if (!upload || upload.status !== 'parsing') return

    const timer = setInterval(() => {
      void fetchReview()
    }, 2500)

    return () => clearInterval(timer)
  }, [upload, fetchReview])

  useEffect(() => {
    if (!upload?.committed_receipt_id) {
      setAutoSuggestion(null)
      setManualCandidates([])
      setExistingMappings([])
      setMatchInfoMessage(null)
      setMatchWindow(null)
      return
    }

    void fetchMatchCandidates()
  }, [upload?.committed_receipt_id, fetchMatchCandidates])

  const unresolvedDuplicates = useMemo(
    () => duplicates.filter((duplicate) => duplicate.status === 'suggested').length,
    [duplicates],
  )

  const lowConfidence = useMemo(() => {
    const confidence = staging?.classification_confidence ?? staging?.extraction_confidence ?? 0
    const warnings = staging?.confidence_warnings_json ?? []
    return confidence < 0.7 || warnings.length > 0
  }, [staging])

  function updateHeaderField(field: keyof StagingHeader, value: string | number | boolean | null) {
    setStaging((current) => (current ? { ...current, [field]: value } : current))
  }

  function updateItemField(id: string, field: keyof StagingItem, value: string | number | null) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  async function applySuggestion(suggestion: ChatSuggestion, suggestionKey: string) {
    setApplyingSuggestionKey(suggestionKey)

    try {
      const response = await fetch(`/api/receipts/review/${uploadId}/chat/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to apply suggestion')
      }

      if (payload?.staging) {
        setStaging(payload.staging as StagingHeader)
      }

      if (payload?.item) {
        setItems((current) => current.map((item) => (item.id === payload.item.id ? payload.item as StagingItem : item)))
      }

      if (Array.isArray(payload?.categories)) {
        setCategories(payload.categories as ReceiptCategory[])
      }

      if (payload?.createdCategory && payload?.category?.name) {
        toast.success(`Created receipt category "${payload.category.name}" and applied correction`)
      } else {
        toast.success('Suggestion applied')
      }

      const warnings = Array.isArray(payload?.warnings) ? payload.warnings : []
      for (const warning of warnings) {
        if (typeof warning === 'string' && warning.trim()) {
          toast.message(warning)
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to apply suggestion')
    } finally {
      setApplyingSuggestionKey((current) => (current === suggestionKey ? null : current))
    }
  }

  function buildMatchReason(
    candidate: StatementMatchCandidate,
    source: 'auto_suggestion' | 'manual_candidate_pick' | 'user_direct',
  ) {
    return {
      source,
      amount_score: candidate.signals.amountScore,
      date_score: candidate.signals.dateScore,
      merchant_score: candidate.signals.merchantScore,
      window_days: candidate.signals.windowDays,
      purchase_preferred: candidate.signals.purchasePreferred,
      merchant_exact: candidate.signals.merchantExact,
      merchant_token_overlap: candidate.signals.merchantTokenOverlap,
      amount_delta: candidate.signals.amountDelta,
    }
  }

  async function handleSave() {
    if (!staging) return

    setSaving(true)
    try {
      const response = await fetch(`/api/receipts/review/${uploadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          header: {
            merchant_name: staging.merchant_name,
            txn_date: staging.txn_date,
            payment_time: staging.payment_time,
            transaction_total: staging.transaction_total,
            payment_information: staging.payment_information,
            payment_type: staging.payment_type,
            payment_breakdown_json: staging.payment_breakdown_json,
            receipt_reference: staging.receipt_reference,
            tax_amount: staging.tax_amount,
            currency: staging.currency,
            notes: staging.notes,
            receipt_category_id: staging.receipt_category_id,
            tag_ids_json: staging.tag_ids_json,
            classification_source: staging.classification_source,
            user_confirmed_low_confidence: staging.user_confirmed_low_confidence,
          },
          items,
          duplicateDecisions: duplicates.map((candidate) => ({
            id: candidate.id,
            status: candidate.status,
          })),
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      toast.success('Review changes saved')
      await fetchReview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save review changes')
    } finally {
      setSaving(false)
    }
  }

  async function handleRecomputeClassification() {
    setRecomputing(true)
    try {
      const response = await fetch(`/api/receipts/classification/${uploadId}/recompute`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      toast.success('Classification recomputed')
      await fetchReview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to recompute classification')
    } finally {
      setRecomputing(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      await handleSave()

      const response = await fetch(`/api/receipts/review/${uploadId}/approve`, {
        method: 'POST',
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(payload?.error || 'Approval failed')
      }

      toast.success('Receipt approved and committed')
      await fetchReview()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve receipt')
    } finally {
      setApproving(false)
    }
  }

  async function createInlineTag(name: string) {
    const response = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to create tag')
    }
    const tag = payload?.tag as TagPresentation | undefined
    if (tag) {
      setTags((current) => [...current, tag].sort((left, right) => left.name.localeCompare(right.name)))
      setStaging((current) => current ? { ...current, tag_ids_json: Array.from(new Set([...current.tag_ids_json, String(tag.id)])) } : current)
      return tag
    }
    return null
  }

  async function handleChatSend() {
    const message = chatInput.trim()
    if (!message) return

    setChatting(true)
    setChatInput('')
    setChatMessages((current) => [...current, { role: 'user', text: message }])

    try {
      const response = await fetch(`/api/receipts/review/${uploadId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = await response.json() as {
        assistantMessage: string
        suggestions: ChatMessage['suggestions']
      }

      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: payload.assistantMessage,
          suggestions: payload.suggestions,
        },
      ])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to get assistant suggestions')
    } finally {
      setChatting(false)
    }
  }

  async function handleCreateMatch(params: {
    candidate: StatementMatchCandidate
    source: 'auto_suggestion' | 'manual_candidate_pick' | 'user_direct'
    status: 'confirmed' | 'rejected'
    notes: string
  }) {
    if (!upload?.committed_receipt_id) return

    setLinkingTxnId(params.candidate.statementTransactionId)
    try {
      const response = await fetch(`/api/receipts/${upload.committed_receipt_id}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statementTransactionId: params.candidate.statementTransactionId,
          status: params.status,
          matchType: params.candidate.confidence >= 0.95 ? 'exact' : 'fuzzy',
          matchConfidence: params.candidate.confidence,
          matchReason: buildMatchReason(params.candidate, params.source),
          notes: params.notes,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      toast.success(
        params.status === 'confirmed'
          ? 'Receipt linked to statement transaction'
          : 'Suggested statement match rejected',
      )
      await fetchMatchCandidates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update mapping')
    } finally {
      setLinkingTxnId(null)
    }
  }

  async function handleUpdateMapping(mappingId: string, payload: {
    status?: 'needs_review' | 'confirmed' | 'rejected'
    notes?: string
    matchReason?: Record<string, unknown>
    matchConfidence?: number
  }) {
    setUpdatingMappingId(mappingId)
    try {
      const response = await fetch(`/api/receipts/matches/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      toast.success('Mapping updated')
      await fetchMatchCandidates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update mapping')
    } finally {
      setUpdatingMappingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!upload) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" className="gap-2" onClick={() => router.push('/receipts')}>
          <ArrowLeft className="size-4" />
          Back to Receipts
        </Button>
        <Card><CardContent className="py-12 text-center text-muted-foreground">Receipt upload not found.</CardContent></Card>
      </div>
    )
  }

  const canApprove = Boolean(staging)
    && unresolvedDuplicates === 0
    && (!lowConfidence || Boolean(staging?.user_confirmed_low_confidence))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" className="-ml-3 gap-2" onClick={() => router.push('/receipts')}>
            <ArrowLeft className="size-4" />
            Back to Receipts
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Receipt Review</h1>
          <p className="text-sm text-muted-foreground">
            {upload.original_filename} • Uploaded {formatDate(upload.created_at)}
          </p>
        </div>
        <Badge>{upload.status}</Badge>
      </div>

      {upload.status === 'parsing' && (
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <Loader2 className="size-5 animate-spin text-blue-500" />
            <p className="text-sm text-muted-foreground">Parsing receipt in background. This page auto-refreshes.</p>
          </CardContent>
        </Card>
      )}

      {upload.parse_error && (
        <Card>
          <CardContent className="py-6 text-sm text-rose-600">{upload.parse_error}</CardContent>
        </Card>
      )}

      {staging && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receipt Header</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Input value={staging.merchant_name ?? ''} onChange={(event) => updateHeaderField('merchant_name', event.target.value)} placeholder="Merchant" />
              <Input type="date" value={staging.txn_date ?? ''} onChange={(event) => updateHeaderField('txn_date', event.target.value || null)} />
              <Input type="time" value={(staging.payment_time || '').slice(0, 5)} onChange={(event) => updateHeaderField('payment_time', event.target.value ? `${event.target.value}:00` : null)} />
              <Input type="number" step="0.01" value={staging.transaction_total ?? ''} onChange={(event) => updateHeaderField('transaction_total', Number(event.target.value))} placeholder="Total" />
              <Input value={staging.currency || 'SGD'} onChange={(event) => updateHeaderField('currency', event.target.value)} placeholder="Currency" />
              <Input value={staging.receipt_reference ?? ''} onChange={(event) => updateHeaderField('receipt_reference', event.target.value)} placeholder="Receipt Reference" />
              <Input value={staging.payment_type ?? ''} onChange={(event) => updateHeaderField('payment_type', event.target.value)} placeholder="Payment Type" />
              <Input value={staging.payment_information ?? ''} onChange={(event) => updateHeaderField('payment_information', event.target.value)} placeholder="Payment Information" />
              <Input type="number" step="0.01" value={staging.tax_amount ?? ''} onChange={(event) => updateHeaderField('tax_amount', Number(event.target.value))} placeholder="Tax Amount" />

              <div className="space-y-2">
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={staging.receipt_category_id ?? ''}
                  onChange={(event) => updateHeaderField('receipt_category_id', event.target.value || null)}
                >
                  <option value="">Select Header Category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <CategoryBadge
                  {...(categories.find((category) => category.id === staging.receipt_category_id) ?? {})}
                  name={categories.find((category) => category.id === staging.receipt_category_id)?.name ?? null}
                  fallbackLabel="Uncategorized"
                  className="h-6"
                />
              </div>

              <Input value={staging.notes ?? ''} onChange={(event) => updateHeaderField('notes', event.target.value)} placeholder="Notes" />

              <div className="space-y-2 md:col-span-2 xl:col-span-3">
                <TagSelector
                  availableTags={tags}
                  selectedTagIds={staging.tag_ids_json ?? []}
                  onChange={(tagIds) => setStaging((current) => current ? { ...current, tag_ids_json: tagIds } : current)}
                  onCreateTag={createInlineTag}
                  title="Receipt Tags"
                  triggerLabel="Choose receipt tags"
                />
                {staging.tag_suggestions_json?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {staging.tag_suggestions_json.map((tag) => (
                      <Badge key={`${tag.name}:${tag.source}`} variant="outline" className="text-xs">
                        Suggested: {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {(staging.tag_ids_json ?? []).map((tagId) => {
                    const tag = tags.find((candidate) => candidate.id === tagId)
                    return tag ? <TagBadge key={tagId} {...tag} className="text-[11px]" /> : null
                  })}
                </div>
              </div>

              <div className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">Classification</p>
                <p className="text-muted-foreground">
                  {staging.classification_source || 'n/a'} • {Math.round((staging.classification_confidence ?? staging.extraction_confidence ?? 0) * 100)}%
                </p>
              </div>

              <div className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">Total</p>
                <p className="text-muted-foreground">
                  {formatCurrency(Number(staging.transaction_total || 0), staging.currency || 'SGD')}
                </p>
              </div>

              <div className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">Warnings</p>
                <p className="text-muted-foreground">{(staging.confidence_warnings_json || []).join(', ') || 'None'}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receipt Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">Item</th>
                      <th className="pb-2 pr-2">Qty</th>
                      <th className="pb-2 pr-2">Unit</th>
                      <th className="pb-2 pr-2">Line Total</th>
                      <th className="pb-2 pr-2">Category</th>
                      <th className="pb-2">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2 pr-2 text-muted-foreground">{item.line_number}</td>
                        <td className="py-2 pr-2">
                          <Input value={item.item_name ?? ''} onChange={(event) => updateItemField(item.id, 'item_name', event.target.value)} />
                        </td>
                        <td className="py-2 pr-2">
                          <Input type="number" step="0.01" value={item.quantity ?? ''} onChange={(event) => updateItemField(item.id, 'quantity', Number(event.target.value))} />
                        </td>
                        <td className="py-2 pr-2">
                          <Input type="number" step="0.01" value={item.unit_price ?? ''} onChange={(event) => updateItemField(item.id, 'unit_price', Number(event.target.value))} />
                        </td>
                        <td className="py-2 pr-2">
                          <Input type="number" step="0.01" value={item.line_total ?? ''} onChange={(event) => updateItemField(item.id, 'line_total', Number(event.target.value))} />
                        </td>
                        <td className="py-2 pr-2">
                          <div className="space-y-1">
                            <select
                              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                              value={item.receipt_category_id ?? ''}
                              onChange={(event) => updateItemField(item.id, 'receipt_category_id', event.target.value || null)}
                            >
                              <option value="">Select Category</option>
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>{category.name}</option>
                              ))}
                            </select>
                            <CategoryBadge
                              {...(categories.find((category) => category.id === item.receipt_category_id) ?? {})}
                              name={categories.find((category) => category.id === item.receipt_category_id)?.name ?? null}
                              fallbackLabel="Uncategorized"
                              className="h-6"
                            />
                          </div>
                        </td>
                        <td className="py-2">
                          {Math.round((item.classification_confidence ?? 0) * 100)}%
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td className="py-6 text-center text-muted-foreground" colSpan={7}>No line items parsed.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Duplicate Candidates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {duplicates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No duplicate candidates.</p>
              ) : (
                duplicates.map((candidate) => (
                  <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">Candidate: {candidate.candidate_receipt_id || 'unknown'}</p>
                      <p className="text-muted-foreground">Score: {Math.round(candidate.score * 100)}% • Signals: {JSON.stringify(candidate.signals_json)}</p>
                    </div>
                    <select
                      className="h-10 rounded-md border bg-background px-3"
                      value={candidate.status}
                      onChange={(event) => setDuplicates((current) => current.map((row) => row.id === candidate.id ? { ...row, status: event.target.value } : row))}
                    >
                      <option value="suggested">Suggested</option>
                      <option value="user_confirmed_duplicate">Confirm Duplicate</option>
                      <option value="user_marked_distinct">Mark Distinct</option>
                      <option value="dismissed">Dismiss</option>
                    </select>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Chat Correction Assistant</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
                {chatMessages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ask for corrections like “set merchant to NTUC FairPrice” or “set item 2 to Household Supplies”.</p>
                ) : (
                  chatMessages.map((message, index) => (
                    <div key={`${message.role}-${index}`} className="space-y-2 text-sm">
                      <p className="font-medium">{message.role === 'user' ? 'You' : 'Assistant'}</p>
                      <p className="text-muted-foreground">{message.text}</p>
                      {message.suggestions && message.suggestions.length > 0 && (
                        <div className="space-y-2">
                          {message.suggestions.map((suggestion, suggestionIndex) => {
                            const suggestionKey = `${index}-${suggestionIndex}`
                            const isApplying = applyingSuggestionKey === suggestionKey
                            const valuePreview = suggestion.targetCategoryName || String(suggestion.value)

                            return (
                              <div key={`${suggestion.field}-${suggestionIndex}`} className="flex items-center justify-between rounded border p-2">
                                <div>
                                  <p className="font-medium">{suggestion.target} • {suggestion.field}</p>
                                  <p className="text-xs text-muted-foreground">{valuePreview} • {suggestion.reason || 'Suggested edit'}</p>
                                  {suggestion.createCategoryIfMissing && suggestion.targetCategoryName && (
                                    <p className="text-xs text-amber-600">Category {suggestion.targetCategoryName} will be created and applied.</p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={Boolean(applyingSuggestionKey) || (suggestion.target === 'item' && !suggestion.itemId)}
                                  onClick={() => applySuggestion(suggestion, suggestionKey)}
                                  className="gap-2"
                                >
                                  {isApplying ? <Loader2 className="size-3 animate-spin" /> : null}
                                  Apply
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  placeholder="Ask for correction suggestions"
                />
                <Button onClick={handleChatSend} disabled={chatting || !chatInput.trim()} className="gap-1">
                  {chatting ? <Loader2 className="size-4 animate-spin" /> : <Bot className="size-4" />}
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Finalize</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={Boolean(staging.user_confirmed_low_confidence)}
                  onCheckedChange={(checked) => updateHeaderField('user_confirmed_low_confidence', Boolean(checked))}
                  id="low-confidence-confirm"
                />
                <label htmlFor="low-confidence-confirm" className="text-sm text-muted-foreground">
                  Confirm low-confidence/missing fields have been manually reviewed.
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleRecomputeClassification} disabled={recomputing} className="gap-2">
                  {recomputing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Recompute Classification
                </Button>
                <Button variant="outline" onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save Review
                </Button>
                <Button onClick={handleApprove} disabled={!canApprove || approving} className="gap-2">
                  {approving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Approve & Commit
                </Button>
              </div>

              <div className="rounded-md border p-3 text-sm text-muted-foreground">
                <p>Approval gates:</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Unresolved duplicate suggestions: {unresolvedDuplicates}</li>
                  <li>Low confidence warning active: {lowConfidence ? 'Yes' : 'No'}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {upload.committed_receipt_id && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auto Statement Match</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The system checks statement transactions by merchant, date, and amount similarity, then asks for your confirmation.
              </p>

              {matchWindow && (
                <p className="text-xs text-muted-foreground">
                  Match window: {matchWindow.from} to {matchWindow.to}
                </p>
              )}

              {autoSuggestion ? (
                <div className="rounded-md border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{autoSuggestion.merchantRaw || 'Unknown merchant'}</p>
                      <p className="text-muted-foreground">
                        {autoSuggestion.txnDate} • {formatCurrency(autoSuggestion.amount, autoSuggestion.currency)} • {autoSuggestion.txnType}
                      </p>
                      {autoSuggestion.description && (
                        <p className="text-xs text-muted-foreground">{autoSuggestion.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Confidence {pct(autoSuggestion.confidence)} • amount {pct(autoSuggestion.signals.amountScore)} • date {pct(autoSuggestion.signals.dateScore)} • merchant {pct(autoSuggestion.signals.merchantScore)}
                      </p>
                      {autoSuggestion.existingMappingStatus && (
                        <Badge variant="outline">Existing mapping: {autoSuggestion.existingMappingStatus}</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="gap-2"
                        disabled={Boolean(linkingTxnId)}
                        onClick={() => handleCreateMatch({
                          candidate: autoSuggestion,
                          source: 'auto_suggestion',
                          status: 'rejected',
                          notes: 'Auto suggestion rejected by user',
                        })}
                      >
                        {linkingTxnId === autoSuggestion.statementTransactionId ? <Loader2 className="size-4 animate-spin" /> : <Unlink2 className="size-4" />}
                        Reject
                      </Button>
                      <Button
                        className="gap-2"
                        disabled={Boolean(linkingTxnId)}
                        onClick={() => handleCreateMatch({
                          candidate: autoSuggestion,
                          source: 'auto_suggestion',
                          status: 'confirmed',
                          notes: 'Auto suggestion confirmed by user',
                        })}
                      >
                        {linkingTxnId === autoSuggestion.statementTransactionId ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                        Confirm Match
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No high-confidence auto suggestion available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manual Candidate Picker</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                If auto-match is unavailable or ambiguous, fetch candidates and link one by selection.
              </p>

              <Button
                variant="outline"
                className="gap-2"
                disabled={matchLoading}
                onClick={async () => {
                  setManualPickerOpened(true)
                  await fetchMatchCandidates(true)
                }}
              >
                {matchLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                Find Possible Transactions
              </Button>

              {manualPickerOpened && (
                <>
                  {manualCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{matchInfoMessage || 'No candidate transactions above 50% confidence.'}</p>
                  ) : (
                    <div className="space-y-2">
                      {manualCandidates.map((candidate) => (
                        <div key={candidate.statementTransactionId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
                          <div>
                            <p className="font-medium">{candidate.merchantRaw || 'Unknown merchant'}</p>
                            <p className="text-muted-foreground">
                              {candidate.txnDate} • {formatCurrency(candidate.amount, candidate.currency)} • {candidate.txnType}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Confidence {pct(candidate.confidence)} • amount {pct(candidate.signals.amountScore)} • date {pct(candidate.signals.dateScore)} • merchant {pct(candidate.signals.merchantScore)}
                            </p>
                          </div>
                          <Button
                            className="gap-2"
                            disabled={Boolean(linkingTxnId)}
                            onClick={() => handleCreateMatch({
                              candidate,
                              source: 'manual_candidate_pick',
                              status: 'confirmed',
                              notes: 'Manually linked from candidate list',
                            })}
                          >
                            {linkingTxnId === candidate.statementTransactionId ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                            Link This Transaction
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Existing Statement Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {existingMappings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No existing links for this receipt.</p>
              ) : (
                existingMappings.map((mapping) => (
                  <div key={mapping.id} className="space-y-3 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{mapping.statementTransaction.merchantRaw || 'Unknown merchant'}</p>
                        <p className="text-muted-foreground">
                          {mapping.statementTransaction.txnDate} • {formatCurrency(mapping.statementTransaction.amount, mapping.statementTransaction.currency)} • {mapping.statementTransaction.txnType}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Mapping confidence {pct(mapping.matchScore)} • type {mapping.matchType}
                        </p>
                      </div>
                      <Badge variant="outline">{mapping.status}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(updatingMappingId)}
                        onClick={() => handleUpdateMapping(mapping.id, { status: 'confirmed' })}
                      >
                        {updatingMappingId === mapping.id ? <Loader2 className="size-4 animate-spin" /> : null}
                        Confirm
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(updatingMappingId)}
                        onClick={() => handleUpdateMapping(mapping.id, { status: 'rejected' })}
                      >
                        {updatingMappingId === mapping.id ? <Loader2 className="size-4 animate-spin" /> : null}
                        Reject
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Input
                        value={mappingNotes[mapping.id] ?? ''}
                        onChange={(event) => {
                          const nextValue = event.target.value
                          setMappingNotes((current) => ({
                            ...current,
                            [mapping.id]: nextValue,
                          }))
                        }}
                        placeholder="Add note"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={Boolean(updatingMappingId)}
                        onClick={() => handleUpdateMapping(mapping.id, {
                          notes: mappingNotes[mapping.id] ?? '',
                          matchReason: {
                            ...(mapping.matchReason ?? {}),
                            source: typeof mapping.matchReason?.source === 'string' ? mapping.matchReason.source : 'user_direct',
                          },
                        })}
                      >
                        {updatingMappingId === mapping.id ? <Loader2 className="size-4 animate-spin" /> : null}
                        Save Note
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
