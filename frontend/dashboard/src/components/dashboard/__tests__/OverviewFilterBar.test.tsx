import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewFilterBar, type OverviewFilters } from '@/components/dashboard/OverviewFilterBar'
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
        for (const child of node) visit(child)
        return
      }

      if (!React.isValidElement(node)) return

      const element = node as React.ReactElement<{ value?: string; children?: React.ReactNode }>
      const type = element.type as { __mockSelectItem?: boolean }
      if (type.__mockSelectItem) {
        items.push({ value: element.props.value as string, label: String(element.props.children) })
        return
      }

      visit(element.props.children as React.ReactNode)
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

afterEach(() => {
  cleanup()
})

describe('OverviewFilterBar', () => {
  function renderBar(filters: OverviewFilters, onChange = vi.fn(), onReset = vi.fn()) {
    const utils = render(
      <OverviewFilterBar
        filters={filters}
        accountOptions={[{ value: 'acc-1', label: 'Primary' }]}
        categoryOptions={[{ value: 'cat-1', label: 'Groceries' }]}
        groupOptions={[{ value: 'grp-1', label: 'Living' }]}
        subgroupOptions={[{ value: 'sub-1', label: 'Food' }]}
        onChange={onChange}
        onReset={onReset}
      />,
    )

    return { ...utils, onChange, onReset }
  }

  it('applies group change with subgroup/category reset', () => {
    const start = {
      ...DEFAULT_OVERVIEW_FILTERS,
      subgroupId: 'sub-1',
      categoryId: 'cat-1',
    }

    const { onChange } = renderBar(start)

    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[3], { target: { value: 'grp-1' } })

    expect(onChange).toHaveBeenCalledWith({
      ...start,
      groupId: 'grp-1',
      subgroupId: 'all',
      categoryId: 'all',
    })
  })

  it('supports reset action', () => {
    const onChange = vi.fn()
    const onReset = vi.fn()
    const start = {
      ...DEFAULT_OVERVIEW_FILTERS,
      categoryId: 'cat-1',
    }

    render(
      <OverviewFilterBar
        filters={start}
        accountOptions={[{ value: 'acc-1', label: 'Primary' }]}
        categoryOptions={[{ value: 'cat-1', label: 'Groceries' }]}
        groupOptions={[{ value: 'grp-1', label: 'Living' }]}
        subgroupOptions={[{ value: 'sub-1', label: 'Food' }]}
        onChange={onChange}
        onReset={onReset}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
