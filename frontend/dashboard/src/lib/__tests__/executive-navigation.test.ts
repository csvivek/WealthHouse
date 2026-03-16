import { describe, expect, it } from 'vitest'
import {
  EXECUTIVE_PRIMARY_NAV,
  getExecutivePrimaryKey,
  isExecutivePathActive,
} from '@/lib/executive-navigation'

describe('executive navigation', () => {
  it('maps wealth routes to the net worth primary rail item', () => {
    expect(getExecutivePrimaryKey('/investments')).toBe('net-worth')
    expect(getExecutivePrimaryKey('/crypto')).toBe('net-worth')
    expect(getExecutivePrimaryKey('/properties')).toBe('net-worth')
  })

  it('keeps digest routes active for receipts and notifications', () => {
    const digestMatchers = EXECUTIVE_PRIMARY_NAV.find((item) => item.key === 'digest')?.matchers ?? []

    expect(isExecutivePathActive('/receipts/review/upload-1', digestMatchers)).toBe(true)
    expect(isExecutivePathActive('/notifications', digestMatchers)).toBe(true)
    expect(isExecutivePathActive('/transactions', digestMatchers)).toBe(false)
  })
})
