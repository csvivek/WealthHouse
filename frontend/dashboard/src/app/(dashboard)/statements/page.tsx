'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload,
  FileUp,
  Loader2,
  FileText,
  ExternalLink,
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
import { createClient } from '@/lib/supabase/client'
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

const statusConfig: Record<string, { label: string; className: string }> = {
  received: { label: 'Received', className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-400' },
  parsing: { label: 'Parsing', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' },
  in_review: { label: 'In Review', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' },
  committing: { label: 'Committing', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400' },
  committed: { label: 'Committed', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
  duplicate: { label: 'Duplicate', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' },
}

export default function StatementsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [imports, setImports] = useState<FileImportRow[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [uploading, setUploading] = useState(false)
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

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      setLoading(false)
      return
    }

    const [acctRes, importRes] = await Promise.all([
      supabase
        .from('accounts')
        .select('id, product_name, nickname, account_type, institutions(name)')
        .eq('household_id', profile.household_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('file_imports')
        .select('id, file_name, institution_code, status, total_rows, approved_rows, rejected_rows, duplicate_rows, committed_rows, statement_period_start, statement_period_end, created_at')
        .eq('household_id', profile.household_id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    setAccounts((acctRes.data as AccountOption[]) ?? [])
    setImports((importRes.data as FileImportRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleUpload(file: File) {
    if (!file) return

    if (!selectedAccountId) {
      toast.error('Please select an account before uploading.')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('statement', file)
      formData.append('account_id', selectedAccountId)

      const res = await fetch('/api/ai/statement', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(`This file has already been processed: ${data.existingFileName}`)
          if (data.existingStatus === 'in_review') {
            router.push(`/statements/review/${data.existingImportId}`)
          }
          return
        }
        toast.error(data.error || 'Failed to parse statement')
        return
      }

      toast.success(`Parsed ${data.transactionsCount} transactions (${data.duplicateCount} duplicates). Redirecting to review…`)
      router.push(data.reviewUrl)
    } catch {
      toast.error('Failed to upload statement')
    } finally {
      setUploading(false)
    }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragOver(false)
    const file = event.dataTransfer.files[0]
    if (file) handleUpload(file)
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
          Upload bank & credit card statements to import transactions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Import Statement
          </CardTitle>
          <CardDescription>
            Upload a PDF or image of your bank statement. The parser will auto-detect the institution using skill profiles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Link to Account <span className="text-red-500">*</span>
              </label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.institutions?.name ? `${account.institutions.name} — ` : ''}
                      {account.nickname ?? account.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          {imports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No statements imported yet.
            </p>
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
                    <th className="pb-3 pr-4 font-medium">Uploaded</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((importRow) => {
                    const status = statusConfig[importRow.status] ?? statusConfig.received
                    return (
                      <tr key={importRow.id} className="border-b last:border-0">
                        <td className="max-w-[200px] truncate py-3 pr-4 font-medium">
                          {importRow.file_name}
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {importRow.institution_code ?? '—'}
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
                          <Badge className={cn('border-0 text-xs', status.className)}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                          {formatDate(importRow.created_at)}
                        </td>
                        <td className="py-3">
                          {(importRow.status === 'in_review' || importRow.status === 'committed') && (
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
