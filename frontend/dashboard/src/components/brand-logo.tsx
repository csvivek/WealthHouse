import Image from 'next/image'
import { cn } from '@/lib/utils'

const BRAND_ASSETS = {
  mark: {
    src: '/brand/wealth-house-mark.png',
    width: 1024,
    height: 1024,
    sizes: '64px',
  },
  lockup: {
    src: '/brand/wealth-house-lockup.png',
    width: 1400,
    height: 800,
    sizes: '(max-width: 1024px) 280px, 420px',
  },
} as const

export type BrandLogoVariant = 'mark' | 'lockup' | 'header'

interface BrandLogoProps {
  alt?: string
  className?: string
  priority?: boolean
  variant: BrandLogoVariant
}

export function BrandLogo({
  alt = 'Wealth House',
  className,
  priority = false,
  variant,
}: BrandLogoProps) {
  if (variant === 'header') {
    return (
      <div className={cn('flex min-w-0 items-center gap-3', className)}>
        <Image
          src={BRAND_ASSETS.mark.src}
          alt=""
          aria-hidden="true"
          width={BRAND_ASSETS.mark.width}
          height={BRAND_ASSETS.mark.height}
          sizes={BRAND_ASSETS.mark.sizes}
          priority={priority}
          unoptimized
          className="size-10 shrink-0 rounded-xl object-cover"
        />
        <span className="truncate text-sm font-semibold tracking-[0.03em] text-foreground">
          {alt}
        </span>
      </div>
    )
  }

  const asset = variant === 'mark' ? BRAND_ASSETS.mark : BRAND_ASSETS.lockup

  return (
    <Image
      src={asset.src}
      alt={alt}
      width={asset.width}
      height={asset.height}
      sizes={asset.sizes}
      priority={priority}
      unoptimized
      className={cn(
        variant === 'mark'
          ? 'size-10 rounded-xl object-cover'
          : 'h-auto w-full max-w-[26rem] object-contain',
        className,
      )}
    />
  )
}
