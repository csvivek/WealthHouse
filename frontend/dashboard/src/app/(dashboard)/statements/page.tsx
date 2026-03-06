'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileText, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/format'

interface ImportRow {
  id: string
  account_id: string
  institution_id: string | null
  statement_name: string
  parse_status: string
  parse_confidence: number
  created_at: string
}

interface AccountInfo {
  id: string
  product_name: string
  nickname: string | null
}

export default function StatementsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [imports, setImports] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<{ message: string; code?: string; previousImportId?: string } | null>(null)

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
      setAccounts((accts as AccountInfo[]) ?? [])

      const { data: imp } = await supabase
        .from('statement_imports')
        .select('*')
        .order('created_at', { ascending: false })
      setImports((imp as ImportRow[]) ?? [])

      setLoading(false)
    }
    fetchData()
  }, [])

  const refreshImports = async () => {
    const supabase = createClient()
    const { data: imp } = await supabase
      .from('statement_imports')
      .select('*')
      .order('created_at', { ascending: false })
    setImports((imp as ImportRow[]) ?? [])
  }

  const loadTransactions = async (importId: string) => {
    // Navigate to the review page instead of loading in a modal
    router.push(`/dashboard/statements/${importId}`)
  }

  const handleUpload = async () => {
    if (!file || !selectedAccount) return
    setUploading(true)
    setUploadError(null)
    try {
      const fd = new FormData()
      fd.append('statement', file)
      fd.append('account_id', selectedAccount)
      // institution_id left blank for now
      const res = await fetch('/api/statements/upload', { method: 'POST', body: fd })
      if (res.ok) {
        await refreshImports()
        setFile(null)
      } else {
        const errorData = await res.json()
        setUploadError({
          message: errorData.error,
          code: errorData.code,
          previousImportId: errorData.previous_import_id,
        })
        console.error('Statement upload failed:', errorData)
      }
    } catch (err) {
      console.error(err)
      setUploadError({ message: 'An error occurred while uploading the file.' })
    } finally {
      setUploading(false)
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
        <p className="text-muted-foreground">Upload bank/fintech statements so transactions can be imported.</p>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id}>{acc.nickname ?? acc.product_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              type="file"
              accept="*/*"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <Button onClick={handleUpload} disabled={uploading || !file || !selectedAccount}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {uploadError && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex gap-3 pt-6">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Upload Error</p>
              <p className="text-sm text-destructive/80 mt-1">{uploadError.message}</p>
              {uploadError.code === 'DUPLICATE_FILENAME' && uploadError.previousImportId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() => router.push(`/dashboard/statements/${uploadError.previousImportId}`)}
                >
                  View Previous Import
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {imports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="mb-4 size-12 text-muted-foreground" />
            No statement imports yet. Upload a file above to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Account</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 pr-4 font-medium">Confidence</th>
                    <th className="pb-3 pr-4 font-medium">Uploaded</th>
                    <th className="pb-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map(imp => {
                    const acc = accounts.find(a => a.id === imp.account_id)
                    return (
                      <tr key={imp.id} className="border-b last:border-0">
                        <td className="py-3 pr-4">{imp.statement_name}</td>
                        <td className="py-3 pr-4">{acc?.nickname ?? acc?.product_name ?? ''}</td>
                        <td className="py-3 pr-4">
                          <Badge variant={imp.parse_status === 'confirmed' ? 'default' : 'secondary'}>
                            {imp.parse_status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">{(imp.parse_confidence * 100).toFixed(0)}%</td>
                        <td className="py-3 pr-4">{formatDate(imp.created_at)}</td>
                        <td className="py-3">
                          {imp.parse_status === 'completed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => router.push(`/dashboard/statements/${imp.id}`)}
                            >
                              Review
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
