'use client'

import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { InstitutionIcon } from '@/components/institution-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type InstitutionBrandDecision = 'verified' | 'generic' | null

export interface InstitutionBrandPreviewState {
  matched: boolean
  brandCode?: string
  canonicalName?: string
  websiteUrl?: string
  iconUrl?: string
}

interface InstitutionBrandPickerProps {
  institutionName: string
  institutionCode?: string | null
  selection: InstitutionBrandDecision
  onSelectionChange: (selection: InstitutionBrandDecision) => void
  onPreviewChange: (preview: InstitutionBrandPreviewState | null) => void
  className?: string
}

function websiteHost(value?: string) {
  if (!value) return null
  try {
    return new URL(value).host.replace(/^www\./, '')
  } catch {
    return value
  }
}

export function InstitutionBrandPicker({
  institutionName,
  institutionCode,
  selection,
  onSelectionChange,
  onPreviewChange,
  className,
}: InstitutionBrandPickerProps) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<InstitutionBrandPreviewState | null>(null)
  const emitPreviewChange = useEffectEvent(onPreviewChange)

  const trimmedName = institutionName.trim()
  const trimmedCode = institutionCode?.trim() || ''
  const queryKey = useMemo(() => `${trimmedName}::${trimmedCode}`, [trimmedCode, trimmedName])

  useEffect(() => {
    if (!trimmedName && !trimmedCode) {
      setPreview(null)
      setLoading(false)
      emitPreviewChange(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)

      try {
        const searchParams = new URLSearchParams()
        if (trimmedName) searchParams.set('name', trimmedName)
        if (trimmedCode) searchParams.set('code', trimmedCode)

        const response = await fetch(`/api/institutions/brand-preview?${searchParams.toString()}`, {
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({ matched: false }))
        if (cancelled) return

        const nextPreview = payload?.matched ? payload as InstitutionBrandPreviewState : null
        setPreview(nextPreview)
        emitPreviewChange(nextPreview)
      } catch {
        if (cancelled) return
        setPreview(null)
        emitPreviewChange(null)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [queryKey])

  if (!trimmedName && !trimmedCode) {
    return null
  }

  if (loading) {
    return (
      <div className={cn('flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="size-4 animate-spin" />
        Checking for a verified institution brand...
      </div>
    )
  }

  if (!preview?.matched) {
    return null
  }

  const host = websiteHost(preview.websiteUrl)

  return (
    <div className={cn('rounded-xl border border-border/70 bg-muted/20 p-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <InstitutionIcon
            iconUrl={preview.iconUrl}
            alt={`${preview.canonicalName || 'Institution'} icon`}
            className="size-10 rounded-lg border border-border/70 bg-background p-1.5"
            fallbackClassName="size-4 text-muted-foreground"
          />
          <div className="min-w-0">
            <div className="font-medium text-foreground">{preview.canonicalName}</div>
            {host ? <div className="text-xs text-muted-foreground">{host}</div> : null}
          </div>
        </div>
        {selection === 'verified' ? (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2 className="size-3.5" />
            Verified
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={selection === 'verified' ? 'default' : 'outline'}
          onClick={() => onSelectionChange('verified')}
        >
          Use verified brand
        </Button>
        <Button
          type="button"
          size="sm"
          variant={selection === 'generic' ? 'secondary' : 'ghost'}
          onClick={() => onSelectionChange('generic')}
        >
          Keep generic
        </Button>
      </div>
    </div>
  )
}
