import { describe, expect, it } from 'vitest'
import {
  buildStatementReviewCategoryFilterOptions,
  filterStatementReviewRowsByCategory,
  filterStatementReviewRowsByStatus,
  type StatementReviewFilterCategoryLike,
  type StatementReviewFilterRowLike,
} from '@/lib/statement-review-filters'

type Row = StatementReviewFilterRowLike & {
  id: string
}

function createRow(overrides: Partial<Row>): Row {
  return {
    id: 'row-1',
    categoryId: null,
    categoryName: null,
    reviewStatus: 'pending',
    flagStatus: 'none',
    ...overrides,
  }
}

describe('statement review filters', () => {
  it('builds unique dataset-scoped category options and includes uncategorized when present', () => {
    const rows = [
      createRow({ id: 'row-1', categoryId: 1, categoryName: 'Groceries' }),
      createRow({ id: 'row-2', categoryId: 1, categoryName: 'Groceries' }),
      createRow({ id: 'row-3', categoryId: 2, categoryName: 'Dining' }),
      createRow({ id: 'row-4', categoryId: null, categoryName: null }),
    ]

    const options = buildStatementReviewCategoryFilterOptions(rows, [])

    expect(options).toEqual([
      { value: 'all', label: 'All Categories' },
      { value: 'uncategorized', label: 'Uncategorized' },
      { value: '2', label: 'Dining' },
      { value: '1', label: 'Groceries' },
    ])
  })

  it('uses the loaded category list only to resolve missing category labels', () => {
    const rows = [
      createRow({ id: 'row-1', categoryId: 42, categoryName: null }),
    ]
    const categories: StatementReviewFilterCategoryLike[] = [
      { id: 42, name: 'Investments' },
      { id: 99, name: 'Travel' },
    ]

    const options = buildStatementReviewCategoryFilterOptions(rows, categories)

    expect(options).toEqual([
      { value: 'all', label: 'All Categories' },
      { value: '42', label: 'Investments' },
    ])
  })

  it('updates the derived option list when the status-scoped dataset changes', () => {
    const rows = [
      createRow({ id: 'row-1', categoryId: 1, categoryName: 'Groceries', reviewStatus: 'pending' }),
      createRow({ id: 'row-2', categoryId: 2, categoryName: 'Dining', reviewStatus: 'pending' }),
      createRow({ id: 'row-3', categoryId: 3, categoryName: 'Investments', reviewStatus: 'approved' }),
    ]

    const pendingRows = filterStatementReviewRowsByStatus(rows, 'pending')
    const options = buildStatementReviewCategoryFilterOptions(pendingRows, [])

    expect(options.map((option) => option.label)).toEqual([
      'All Categories',
      'Dining',
      'Groceries',
    ])
  })

  it('filters rows by the selected category and reuses the uncategorized sentinel', () => {
    const rows = [
      createRow({ id: 'row-1', categoryId: 1, categoryName: 'Groceries' }),
      createRow({ id: 'row-2', categoryId: 2, categoryName: 'Dining' }),
      createRow({ id: 'row-3', categoryId: null, categoryName: null }),
      createRow({ id: 'row-4', categoryId: null, categoryName: 'Manual Match' }),
    ]

    expect(filterStatementReviewRowsByCategory(rows, '2').map((row) => row.id)).toEqual(['row-2'])
    expect(filterStatementReviewRowsByCategory(rows, 'uncategorized').map((row) => row.id)).toEqual(['row-3'])
    expect(filterStatementReviewRowsByCategory(rows, 'name:manual match').map((row) => row.id)).toEqual(['row-4'])
  })
})
