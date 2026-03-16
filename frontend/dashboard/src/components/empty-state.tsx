import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

type EmptyStateAction =
  | {
      label: string
      href: string
      onClick?: never
    }
  | {
      label: string
      onClick: () => void
      href?: never
    }

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: EmptyStateAction
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center sm:py-20">
      <div className="rounded-[1.4rem] border border-border/80 bg-card/90 p-4 shadow-[0_20px_45px_rgba(3,7,18,0.28)]">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
        <p className="max-w-lg text-sm text-muted-foreground">{description}</p>
      </div>
      {action?.href ? (
        <Button asChild className="mt-2">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : action?.onClick ? (
        <Button className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
