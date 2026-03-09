import { describe, expect, it } from 'vitest'
import { resolveDatePeriodRange } from '@/lib/date-periods'

describe('resolveDatePeriodRange', () => {
  const baseDate = new Date('2026-03-09T10:00:00.000Z')

  it('returns current month range', () => {
    const range = resolveDatePeriodRange('this_month', baseDate)
    expect(range).toEqual({ start: '2026-03-01', end: '2026-03-09' })
  })

  it('returns last quarter range', () => {
    const range = resolveDatePeriodRange('last_quarter', baseDate)
    expect(range).toEqual({ start: '2025-10-01', end: '2025-12-31' })
  })

  it('returns open range for all history', () => {
    const range = resolveDatePeriodRange('all_history', baseDate)
    expect(range).toEqual({ start: null, end: null })
  })
})
