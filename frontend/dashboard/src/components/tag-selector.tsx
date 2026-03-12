'use client'

import { useMemo, useState } from 'react'
import { Check, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { TagBadge, type TagPresentation } from '@/components/tag-badge'
import { cn } from '@/lib/utils'

export interface TagSelectorProps {
  availableTags: TagPresentation[]
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
  onCreateTag?: (name: string) => Promise<TagPresentation | null>
  disabled?: boolean
  title?: string
  triggerLabel?: string
  emptyLabel?: string
  triggerFocusTarget?: string
}

export function TagSelector({
  availableTags,
  selectedTagIds,
  onChange,
  onCreateTag,
  disabled = false,
  title = 'Manage Tags',
  triggerLabel = 'Edit tags',
  emptyLabel = 'No tags',
  triggerFocusTarget,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const selectedSet = useMemo(() => new Set(selectedTagIds), [selectedTagIds])
  const selectedTags = useMemo(
    () => availableTags.filter((tag) => tag.id && selectedSet.has(tag.id)),
    [availableTags, selectedSet],
  )

  const filteredTags = useMemo(() => {
    const normalized = search.trim().toLowerCase()
    return availableTags.filter((tag) => !normalized || tag.name.toLowerCase().includes(normalized))
  }, [availableTags, search])

  const canCreate = Boolean(
    onCreateTag &&
      search.trim().length > 0 &&
      !availableTags.some((tag) => tag.name.trim().toLowerCase() === search.trim().toLowerCase()),
  )

  async function handleCreate() {
    if (!onCreateTag || !canCreate) return
    setCreating(true)
    try {
      const created = await onCreateTag(search.trim())
      if (created?.id) {
        onChange(Array.from(new Set([...selectedTagIds, created.id])))
        setSearch('')
      }
    } finally {
      setCreating(false)
    }
  }

  function toggleTag(tagId: string) {
    if (selectedSet.has(tagId)) {
      onChange(selectedTagIds.filter((value) => value !== tagId))
      return
    }
    onChange([...selectedTagIds, tagId])
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {selectedTags.length > 0 ? (
          selectedTags.map((tag) => <TagBadge key={tag.id ?? tag.name} {...tag} className="text-xs" />)
        ) : (
          <span className="text-xs text-muted-foreground">{emptyLabel}</span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setOpen(true)}
          disabled={disabled}
          {...(triggerFocusTarget ? { 'data-editor-focus-target': triggerFocusTarget } : {})}
        >
          {triggerLabel}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Select existing tags or create a new tag.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search or create a tag" className="pl-9" />
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {filteredTags.map((tag) => {
                const checked = tag.id ? selectedSet.has(tag.id) : false
                return (
                  <div
                    key={tag.id ?? tag.name}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm',
                      checked && 'border-primary bg-primary/5',
                    )}
                    onClick={() => tag.id && toggleTag(tag.id)}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && tag.id) {
                        event.preventDefault()
                        toggleTag(tag.id)
                      }
                    }}
                  >
                    <TagBadge {...tag} />
                    <Checkbox checked={checked} aria-label={`Toggle ${tag.name}`} />
                  </div>
                )
              })}

              {filteredTags.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No tags match this search.</p>}
            </div>

            {canCreate && (
              <Button type="button" variant="secondary" className="w-full gap-2" disabled={creating} onClick={handleCreate}>
                {creating ? <Check className="size-4" /> : <Plus className="size-4" />}
                Create “{search.trim()}”
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
