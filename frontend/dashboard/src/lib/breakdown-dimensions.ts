export type BreakdownDimension = 'category' | 'subgroup' | 'group'

export interface BreakdownDimensionOption {
  value: BreakdownDimension
  label: string
  description: string
}

export const BREAKDOWN_DIMENSION_OPTIONS: BreakdownDimensionOption[] = [
  {
    value: 'category',
    label: 'Category',
    description: 'Most granular taxonomy split.',
  },
  {
    value: 'subgroup',
    label: 'Subgroup',
    description: 'Roll-up across related categories.',
  },
  {
    value: 'group',
    label: 'Group',
    description: 'Top-level spending or income buckets.',
  },
]

export const DEFAULT_BREAKDOWN_DIMENSION: BreakdownDimension = 'category'
