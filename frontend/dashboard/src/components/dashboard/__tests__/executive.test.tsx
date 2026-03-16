import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DashboardPeriodPills,
  DashboardScopeDrawer,
} from '@/components/dashboard/executive'
import { DEFAULT_OVERVIEW_FILTERS } from '@/lib/overview-filters'

vi.mock('@/components/ui/select', () => {
  const SelectItem = Object.assign(
    ({ children }: { value: string; children: React.ReactNode }) => <>{children}</>,
    { __mockSelectItem: true },
  )

  function collectItems(children: React.ReactNode): Array<{ value: string; label: string }> {
    const items: Array<{ value: string; label: string }> = []

    const visit = (node: React.ReactNode) => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(visit)
        return
      }
      if (!React.isValidElement(node)) return

      const element = node as React.ReactElement<{ value?: string; children?: React.ReactNode }>
      const type = element.type as { __mockSelectItem?: boolean }
      if (type.__mockSelectItem) {
        items.push({ value: String(element.props.value), label: String(element.props.children) })
        return
      }

      visit(element.props.children)
    }

    visit(children)
    return items
  }

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: React.ReactNode
  }) {
    const items = collectItems(children)
    return (
      <select role="combobox" value={value} onChange={(event) => onValueChange(event.target.value)}>
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    )
  }

  return {
    Select,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem,
  }
})

vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({
    open,
    children,
  }: {
    open: boolean
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
  }) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(() => {
  cleanup()
})

describe('dashboard executive controls', () => {
  it('maps the primary pills to executive periods', () => {
    const onChange = vi.fn()

    render(<DashboardPeriodPills value="this_month" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'This Year' }))
    expect(onChange).toHaveBeenCalledWith('this_year')
  })

  it('preserves group change reset behavior in the advanced filter drawer', () => {
    const onChange = vi.fn()
    const start = {
      ...DEFAULT_OVERVIEW_FILTERS,
      subgroupId: 'sub-1',
      categoryId: 'cat-1',
    }

    render(
      <DashboardScopeDrawer
        filters={start}
        accountOptions={[{ value: 'acc-1', label: 'Primary' }]}
        categoryOptions={[{ value: 'cat-1', label: 'Groceries' }]}
        groupOptions={[{ value: 'grp-1', label: 'Living' }]}
        subgroupOptions={[{ value: 'sub-1', label: 'Food' }]}
        onChange={onChange}
        onReset={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /More Filters/i }))

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[2], { target: { value: 'grp-1' } })

    expect(onChange).toHaveBeenCalledWith({
      ...start,
      groupId: 'grp-1',
      subgroupId: 'all',
      categoryId: 'all',
    })
  })
})
