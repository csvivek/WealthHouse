import { describe, expect, it } from 'vitest'
import { inferCategoryStyleFromName, resolveCategoryStyle } from '@/lib/server/category-style'

describe('inferCategoryStyleFromName', () => {
  it('maps known names to style presets', () => {
    expect(inferCategoryStyleFromName('Salary Credit')).toEqual({
      icon_key: 'salary',
      color_token: 'chart-1',
    })

    expect(inferCategoryStyleFromName('Weekly Groceries')).toEqual({
      icon_key: 'groceries',
      color_token: 'chart-2',
    })
  })

  it('falls back to generic style for unknown names', () => {
    expect(inferCategoryStyleFromName('Miscellaneous')).toEqual({
      icon_key: 'tag',
      color_token: 'slate',
    })
  })
})

describe('resolveCategoryStyle', () => {
  it('uses inferred values when explicit style is not provided', () => {
    expect(resolveCategoryStyle({ name: 'Electric Utilities' })).toEqual({
      icon_key: 'utilities',
      color_token: 'chart-4',
      color_hex: null,
    })
  })

  it('honors explicit icon/color overrides', () => {
    expect(
      resolveCategoryStyle({
        name: 'Salary Credit',
        iconKey: 'cash',
        colorToken: 'chart-5',
        colorHex: '#22c55e',
      }),
    ).toEqual({
      icon_key: 'cash',
      color_token: 'chart-5',
      color_hex: '#22c55e',
    })
  })
})
