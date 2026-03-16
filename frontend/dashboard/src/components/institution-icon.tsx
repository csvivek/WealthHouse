'use client'

import { useEffect, useState, type ElementType } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InstitutionIconProps {
  iconUrl?: string | null
  alt: string
  className?: string
  imageClassName?: string
  fallbackClassName?: string
  fallbackIcon?: ElementType<{ className?: string }>
}

export function InstitutionIcon({
  iconUrl,
  alt,
  className,
  imageClassName,
  fallbackClassName,
  fallbackIcon: FallbackIcon = Building2,
}: InstitutionIconProps) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [iconUrl])

  return (
    <span className={cn('inline-flex items-center justify-center overflow-hidden', className)}>
      {iconUrl && !failed ? (
        <img
          src={iconUrl}
          alt={alt}
          className={cn('h-full w-full object-contain', imageClassName)}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <FallbackIcon className={cn('size-4', fallbackClassName)} />
      )}
    </span>
  )
}
