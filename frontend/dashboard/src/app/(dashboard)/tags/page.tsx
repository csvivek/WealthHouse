'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { CategoryIcon } from '@/components/category-icon'
import { CategoryColorDot } from '@/components/category-color-dot'
import { TAG_COLOR_OPTIONS, TAG_ICON_OPTIONS } from '@/lib/tags/options'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'

interface TagRow extends TagPresentation {
  id: string
  normalized_name: string
  description: string | null
  source: 'default' | 'member' | 'custom' | 'system'
  is_active: boolean
  created_at: string
  updated_at: string
  statement_mapped_count: number
  receipt_mapped_count: number
  total_mapped_count: number
}

function emptyDraft() {
  return {
    name: '',
    color_token: 'slate',
    color_hex: '',
    icon_key: 'tag',
    description: '',
  }
}

export default function TagsPage() {
  const [rows, setRows] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState<'all' | 'default' | 'member' | 'custom' | 'system'>('all')
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'usage_count'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeTargetId, setMergeTargetId] = useState('')
  const [draft, setDraft] = useState(emptyDraft())
  const [saving, setSaving] = useState(false)
  const [mergeSaving, setMergeSaving] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(timer)
  }, [searchInput])

  const loadTags = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search,
        source,
        status: 'active',
        sortBy,
        sortDir,
      })
      const response = await fetch(`/api/tags?${params.toString()}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to load tags')
      setRows(Array.isArray(payload?.tags) ? payload.tags : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load tags')
    } finally {
      setLoading(false)
    }
  }, [search, source, sortBy, sortDir])

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  const mergeTargets = useMemo(() => {
    if (!editingTag) return []
    const normalizedSearch = mergeSearch.trim().toLowerCase()
    return rows
      .filter((row) => row.id !== editingTag.id)
      .filter((row) => row.is_active)
      .filter((row) => !normalizedSearch || row.name.toLowerCase().includes(normalizedSearch))
  }, [editingTag, mergeSearch, rows])

  function openCreate() {
    setEditingTag(null)
    setDraft(emptyDraft())
    setEditorOpen(true)
  }

  function openEdit(tag: TagRow) {
    setEditingTag(tag)
    setDraft({
      name: tag.name,
      color_token: tag.color_token ?? 'slate',
      color_hex: tag.color_hex ?? '',
      icon_key: tag.icon_key ?? 'tag',
      description: tag.description ?? '',
    })
    setEditorOpen(true)
  }

  async function saveTag() {
    if (!draft.name.trim()) {
      toast.error('Tag name is required')
      return
    }
    setSaving(true)
    try {
      const response = await fetch(editingTag ? `/api/tags/${editingTag.id}` : '/api/tags', {
        method: editingTag ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          color_token: draft.color_token,
          color_hex: draft.color_hex.trim() || null,
          icon_key: draft.icon_key,
          description: draft.description.trim() || null,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to save tag')
      toast.success(editingTag ? 'Tag updated' : 'Tag created')
      setEditorOpen(false)
      await loadTags()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save tag')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTag(tag: TagRow) {
    const confirmed = confirm(`Delete tag "${tag.name}"? Existing mappings will be detached.`)
    if (!confirmed) return
    try {
      const response = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete tag')
      toast.success('Tag deleted')
      await loadTags()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete tag')
    }
  }

  async function runMerge() {
    if (!editingTag || !mergeTargetId) {
      toast.error('Choose a target tag')
      return
    }
    setMergeSaving(true)
    try {
      const response = await fetch(`/api/tags/${editingTag.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: mergeTargetId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Failed to merge tag')
      toast.success('Tag merged')
      setMergeOpen(false)
      await loadTags()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to merge tag')
    } finally {
      setMergeSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">Household-scoped labels for statement and receipt transactions.</p>
        </div>
        <Button onClick={openCreate}>Create Tag</Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search tags" className="pl-9" />
        </div>
        <Select value={source} onValueChange={(value) => setSource(value as typeof source)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
            <SelectItem value="usage_count">Usage</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setSortDir((current) => current === 'asc' ? 'desc' : 'asc')} className="gap-2">
          {sortDir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          {sortDir === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tag Library</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading tags…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No tags found for this household.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Tag</th>
                    <th className="pb-2 pr-4 font-medium">Source</th>
                    <th className="pb-2 pr-4 font-medium">Statement</th>
                    <th className="pb-2 pr-4 font-medium">Receipts</th>
                    <th className="pb-2 pr-4 font-medium">Total</th>
                    <th className="pb-2 pr-4 font-medium">Created</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <div className="space-y-1">
                          <TagBadge {...row} />
                          {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge variant={row.is_active ? 'secondary' : 'outline'}>{row.source}</Badge>
                      </td>
                      <td className="py-3 pr-4">{row.statement_mapped_count}</td>
                      <td className="py-3 pr-4">{row.receipt_mapped_count}</td>
                      <td className="py-3 pr-4 font-medium">{row.total_mapped_count}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{formatDate(row.created_at)}</td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>Edit</Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingTag(row)
                              setMergeTargetId('')
                              setMergeSearch('')
                              setMergeOpen(true)
                            }}
                          >
                            Merge
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => void deleteTag(row)}>
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
            <DialogDescription>Update the display name, icon, color, and description used across transaction screens.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Tag name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Icon</label>
                <Select value={draft.icon_key} onValueChange={(value) => setDraft((current) => ({ ...current, icon_key: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose icon" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <CategoryIcon icon_key={option.value} className="size-4" />
                          <span>{option.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Color Token</label>
                <Select value={draft.color_token} onValueChange={(value) => setDraft((current) => ({ ...current, color_token: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose color" />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_COLOR_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <span className="flex items-center gap-2">
                          <CategoryColorDot color_token={option.value} color_hex={null} className="size-2.5" />
                          <span>{option.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Custom Hex</label>
              <Input value={draft.color_hex} onChange={(event) => setDraft((current) => ({ ...current, color_hex: event.target.value }))} placeholder="#0f766e" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Optional description" />
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</p>
              <TagBadge
                name={draft.name || 'Tag preview'}
                icon_key={draft.icon_key}
                color_token={draft.color_token}
                color_hex={draft.color_hex || null}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveTag()} disabled={saving}>{saving ? 'Saving…' : 'Save Tag'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Tag</DialogTitle>
            <DialogDescription>Select the surviving tag. Existing mappings will move to that tag without duplicates.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={mergeSearch} onChange={(event) => setMergeSearch(event.target.value)} placeholder="Search target tag" />
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {mergeTargets.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${mergeTargetId === row.id ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => setMergeTargetId(row.id)}
                >
                  <div>
                    <TagBadge {...row} />
                    <p className="mt-1 text-xs text-muted-foreground">{row.total_mapped_count} total mapping{row.total_mapped_count === 1 ? '' : 's'}</p>
                  </div>
                  <Badge variant="outline">{row.source}</Badge>
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
            <Button onClick={() => void runMerge()} disabled={mergeSaving}>{mergeSaving ? 'Merging…' : 'Merge Tags'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
