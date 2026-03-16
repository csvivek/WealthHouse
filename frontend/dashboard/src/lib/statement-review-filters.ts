export type StatementReviewStatusFilter =
  | 'all'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'committed'
  | 'already_imported'
  | 'duplicate'

export type ReviewCategoryFilterValue = string

export interface ReviewCategoryFilterOption {
  value: ReviewCategoryFilterValue
  label: string
}

export interface StatementReviewFilterRowLike {
  categoryId: number | null
  categoryName: string | null
  reviewStatus: string
  flagStatus: string
}

export interface StatementReviewFilterCategoryLike {
  id: number
  name: string
}

interface ReviewCategoryFilterConfig {
  allValue?: string
  allLabel?: string
  uncategorizedValue?: string
  uncategorizedLabel?: string
}

const DEFAULT_CONFIG: Required<ReviewCategoryFilterConfig> = {
  allValue: 'all',
  allLabel: 'All Categories',
  uncategorizedValue: 'uncategorized',
  uncategorizedLabel: 'Uncategorized',
}

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function resolveConfig(config?: ReviewCategoryFilterConfig) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  }
}

function getResolvedCategoryOption(
  row: Pick<StatementReviewFilterRowLike, 'categoryId' | 'categoryName'>,
  labelsById: Map<number, string>,
) {
  const categoryName = row.categoryName?.trim() ?? ''

  if (row.categoryId != null) {
    return {
      value: String(row.categoryId),
      label: categoryName || labelsById.get(row.categoryId) || `Category ${row.categoryId}`,
    }
  }

  if (categoryName) {
    return {
      value: `name:${normalizeCategoryName(categoryName)}`,
      label: categoryName,
    }
  }

  return null
}

function isUncategorizedRow(row: Pick<StatementReviewFilterRowLike, 'categoryId' | 'categoryName'>) {
  return row.categoryId == null && !(row.categoryName?.trim())
}

export function filterStatementReviewRowsByStatus<TRow extends StatementReviewFilterRowLike>(
  rows: TRow[],
  filter: StatementReviewStatusFilter,
) {
  if (filter === 'all') return rows
  if (filter === 'duplicate') return rows.filter((row) => row.flagStatus === 'duplicate_in_file')
  if (filter === 'already_imported') return rows.filter((row) => row.flagStatus === 'already_imported')
  return rows.filter((row) => row.reviewStatus === filter)
}

export function buildStatementReviewCategoryFilterOptions<
  TRow extends StatementReviewFilterRowLike,
  TCategory extends StatementReviewFilterCategoryLike,
>(
  rows: TRow[],
  categories: TCategory[],
  config?: ReviewCategoryFilterConfig,
): ReviewCategoryFilterOption[] {
  const resolvedConfig = resolveConfig(config)
  const labelsById = new Map(categories.map((category) => [category.id, category.name]))
  const optionMap = new Map<string, ReviewCategoryFilterOption>()
  let hasUncategorized = false

  for (const row of rows) {
    const resolved = getResolvedCategoryOption(row, labelsById)
    if (resolved) {
      optionMap.set(resolved.value, resolved)
      continue
    }

    if (isUncategorizedRow(row)) {
      hasUncategorized = true
    }
  }

  const derivedOptions = Array.from(optionMap.values()).sort((left, right) => left.label.localeCompare(right.label))

  return [
    { value: resolvedConfig.allValue, label: resolvedConfig.allLabel },
    ...(hasUncategorized ? [{ value: resolvedConfig.uncategorizedValue, label: resolvedConfig.uncategorizedLabel }] : []),
    ...derivedOptions,
  ]
}

export function filterStatementReviewRowsByCategory<TRow extends StatementReviewFilterRowLike>(
  rows: TRow[],
  categoryFilterValue: ReviewCategoryFilterValue,
  config?: ReviewCategoryFilterConfig,
) {
  const resolvedConfig = resolveConfig(config)

  if (categoryFilterValue === resolvedConfig.allValue) return rows
  if (categoryFilterValue === resolvedConfig.uncategorizedValue) {
    return rows.filter((row) => isUncategorizedRow(row))
  }

  return rows.filter((row) => {
    if (row.categoryId != null) {
      return String(row.categoryId) === categoryFilterValue
    }

    const categoryName = row.categoryName?.trim()
    if (!categoryName) return false
    return `name:${normalizeCategoryName(categoryName)}` === categoryFilterValue
  })
}
