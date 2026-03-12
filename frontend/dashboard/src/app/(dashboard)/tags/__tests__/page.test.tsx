import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import TagsPage from '@/app/(dashboard)/tags/page'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => payload,
  } as Response
}

describe('TagsPage', () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.hasPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => false })
    }
    if (!HTMLElement.prototype.setPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: () => undefined })
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: () => undefined })
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: () => undefined })
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('loads and renders tag rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createJsonResponse({
      tags: [
        {
          id: 'tag-1',
          name: 'Travel',
          normalized_name: 'travel',
          color_token: 'chart-4',
          color_hex: null,
          icon_key: 'travel',
          description: 'Trips and vacations',
          source: 'default',
          is_active: true,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          statement_mapped_count: 2,
          receipt_mapped_count: 1,
          total_mapped_count: 3,
        },
      ],
    })))

    render(<TagsPage />)

    await waitFor(() => {
      expect(screen.getByText('Travel')).toBeInTheDocument()
    })
    expect(screen.getByText('Trips and vacations')).toBeInTheDocument()
  })

  it('opens the create dialog and posts the new tag', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tags?')) {
        return createJsonResponse({ tags: [] })
      }
      if (url === '/api/tags' && init?.method === 'POST') {
        return createJsonResponse({ tag: { id: 'tag-2', name: 'Medical' } })
      }
      return createJsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<TagsPage />)

    await userEvent.click(screen.getByRole('button', { name: 'Create Tag' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    const inputs = screen.getAllByPlaceholderText('Tag name')
    await userEvent.type(inputs[0], 'Medical')
    await userEvent.click(screen.getByRole('button', { name: 'Save Tag' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/tags', expect.objectContaining({ method: 'POST' }))
    })
    expect(toast.success).toHaveBeenCalled()
  })
})
