'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronsUpDown, LogOut, Settings, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  EXECUTIVE_PRIMARY_NAV,
  EXECUTIVE_SECONDARY_NAV,
  getExecutivePrimaryKey,
  isExecutivePathActive,
} from '@/lib/executive-navigation'
import { BrandLogo } from '@/components/brand-logo'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface ExecutiveAppShellProps {
  children: ReactNode
  user: { id: string; email?: string }
  profile: {
    display_name: string | null
    avatar_url: string | null
    role: string
    households: { name: string; base_currency: string } | null
  } | null
  digestBadgeCount?: number
}

function getInitials(displayName: string | null | undefined, email: string | undefined) {
  if (displayName) {
    return displayName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  return email?.[0]?.toUpperCase() ?? 'U'
}

export function ExecutiveAppShell({
  children,
  user,
  profile,
  digestBadgeCount = 0,
}: ExecutiveAppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const primaryKey = getExecutivePrimaryKey(pathname)
  const displayName = profile?.display_name || user.email || 'User'
  const householdName = profile?.households?.name || 'Wealth House'
  const baseCurrency = profile?.households?.base_currency || 'SGD'
  const initials = getInitials(profile?.display_name, user.email)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="executive-shell min-h-screen">
      <div className="executive-shell__gradient" />

      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/86 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-6 xl:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href="/dashboard"
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border/80 bg-card/85 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-card"
              >
                <BrandLogo variant="mark" alt="" priority className="size-10 rounded-xl" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold tracking-[0.03em] text-foreground">
                    Wealth House
                  </p>
                  <p className="truncate font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {householdName}
                  </p>
                </div>
              </Link>

              <nav className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
                {EXECUTIVE_PRIMARY_NAV.map((item) => {
                  const active = item.key === primaryKey
                  const showBadge = item.key === 'digest' && digestBadgeCount > 0

                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={cn(
                        'flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                        active
                          ? 'border-primary/40 bg-primary/12 text-primary'
                          : 'border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground',
                      )}
                    >
                      <span>{item.label}</span>
                      {showBadge ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground">
                          {digestBadgeCount}
                        </span>
                      ) : null}
                    </Link>
                  )
                })}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 sm:flex">
                <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(45,212,191,0.75)]" />
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-200">
                  Live workspace
                </span>
              </div>

              <Badge variant="outline" className="hidden sm:inline-flex">
                Base {baseCurrency}
              </Badge>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11 gap-3 rounded-2xl px-3">
                    <Avatar className="size-8">
                      {profile?.avatar_url ? (
                        <AvatarImage src={profile.avatar_url} alt={displayName} />
                      ) : null}
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="hidden min-w-0 text-left sm:block">
                      <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                      <p className="truncate font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {profile?.role || 'member'}
                      </p>
                    </div>
                    <ChevronsUpDown className="size-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-semibold text-foreground">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <Settings className="size-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">
                      <User className="size-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOut className="size-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="flex min-w-max items-center gap-6">
              {EXECUTIVE_SECONDARY_NAV.map((section) => (
                <div key={section.key} className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                    {section.label}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {section.items.map((item) => {
                      const active = isExecutivePathActive(pathname, item.matchers)
                      return (
                        <Link
                          key={item.key}
                          href={item.href}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-xs transition-colors',
                            active
                              ? 'border-primary/40 bg-primary/12 text-primary'
                              : 'border-transparent bg-card/55 text-muted-foreground hover:border-border hover:bg-card hover:text-foreground',
                          )}
                        >
                          {item.label}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1680px] px-4 pb-10 pt-6 sm:px-6 xl:px-8">
        {children}
      </main>
    </div>
  )
}
