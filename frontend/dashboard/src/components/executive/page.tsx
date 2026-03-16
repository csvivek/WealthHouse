import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, type LucideIcon } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ExecutivePage({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('space-y-8', className)}>{children}</div>
}

export function ExecutivePageHeader({
  title,
  description,
  actions,
  badges,
  backHref,
  backLabel = 'Back',
  eyebrow,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  badges?: ReactNode
  backHref?: string
  backLabel?: string
  eyebrow?: ReactNode
}) {
  return (
    <section className="rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(12,18,31,0.98))] px-5 py-5 shadow-[0_24px_80px_rgba(3,7,18,0.35)] sm:px-6 sm:py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          {eyebrow ? (
            <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}

          {backHref ? (
            <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit gap-2 px-3">
              <Link href={backHref}>
                <ArrowLeft className="size-4" />
                {backLabel}
              </Link>
            </Button>
          ) : null}

          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-4xl text-sm text-muted-foreground sm:text-base">{description}</p>
            ) : null}
          </div>

          {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </section>
  )
}

export function ExecutiveMetricGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
}

export function ExecutiveEmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center sm:py-20">
      <div className="rounded-[1.4rem] border border-border/80 bg-card/90 p-4 shadow-[0_20px_45px_rgba(3,7,18,0.28)]">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
        <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export function ExecutiveAuthShell({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(96,165,250,0.12),transparent_28%),linear-gradient(180deg,rgba(11,15,26,0.92),rgba(8,12,22,1))]" />
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(201,168,76,0.9),transparent)]" />

      <div className="relative z-10 grid w-full max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <section className="hidden space-y-6 lg:block">
          <BrandLogo variant="lockup" priority className="max-w-[28rem]" />

          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Executive finance workspace
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary/80">
              Personal finance, restyled
            </p>
            <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.06em] text-foreground">
              {title}
            </h1>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">{description}</p>
          </div>
        </section>

        <section className="rounded-[1.9rem] border border-border/80 bg-card/92 p-6 shadow-[0_30px_100px_rgba(3,7,18,0.46)] sm:p-8">
          <div className="mb-8 space-y-2 lg:hidden">
            <div className="space-y-1">
              <BrandLogo variant="header" priority />
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Executive finance workspace
                </p>
              </div>
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.05em] text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>

          {children}
        </section>
      </div>
    </div>
  )
}
