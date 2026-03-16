/* eslint-disable @next/next/no-img-element */

import type { ImgHTMLAttributes, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExecutiveAppShell } from '@/components/executive/app-shell'
import { createClient } from '@/lib/supabase/client'

const push = vi.fn()
const signOut = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/transactions',
  useRouter: () => ({ push }),
}))

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) => {
    const { priority: ignoredPriority, unoptimized: ignoredUnoptimized, ...imageProps } = props as Record<
      string,
      unknown
    >
    void ignoredPriority
    void ignoredUnoptimized
    return <img alt={alt} src={src} {...(imageProps as ImgHTMLAttributes<HTMLImageElement>)} />
  },
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}))

describe('ExecutiveAppShell', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        signOut,
      },
    } as unknown as ReturnType<typeof createClient>)
  })

  afterEach(() => {
    push.mockReset()
    signOut.mockReset()
    cleanup()
  })

  it('renders primary navigation, secondary sections, and the current route content', () => {
    render(
      <ExecutiveAppShell
        user={{ id: 'user-1', email: 'owner@example.com' }}
        profile={{
          display_name: 'Owner User',
          avatar_url: null,
          role: 'owner',
          households: { name: 'Family Office', base_currency: 'SGD' },
        }}
        digestBadgeCount={3}
      >
        <div>route content</div>
      </ExecutiveAppShell>,
    )

    expect(
      screen.getByRole('link', { name: /Wealth House Family Office/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Family Office')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Transactions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Digest3/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Categories' })).toBeInTheDocument()
    expect(screen.getByText('route content')).toBeInTheDocument()
  })

  it('opens the user menu and signs out through the shell controls', async () => {
    render(
      <ExecutiveAppShell
        user={{ id: 'user-1', email: 'owner@example.com' }}
        profile={{
          display_name: 'Owner User',
          avatar_url: null,
          role: 'owner',
          households: { name: 'Family Office', base_currency: 'SGD' },
        }}
      >
        <div>route content</div>
      </ExecutiveAppShell>,
    )

    fireEvent.click(await screen.findByText('Sign out'))

    await waitFor(() => {
      expect(signOut).toHaveBeenCalled()
      expect(push).toHaveBeenCalledWith('/login')
    })
  })
})
