import { describe, expect, it } from 'vitest'
import {
  hasExactTransferCandidateAmount,
  isTransferCandidateWithinPastDays,
} from './internal-transfer-links'

describe('isTransferCandidateWithinPastDays', () => {
  it('includes same-day candidates', () => {
    expect(isTransferCandidateWithinPastDays('2026-03-10', '2026-03-10', 2)).toBe(true)
  })

  it('includes candidates from 1 day earlier', () => {
    expect(isTransferCandidateWithinPastDays('2026-03-10', '2026-03-09', 2)).toBe(true)
  })

  it('includes candidates from 2 days earlier', () => {
    expect(isTransferCandidateWithinPastDays('2026-03-10', '2026-03-08', 2)).toBe(true)
  })

  it('excludes candidates older than the allowed window', () => {
    expect(isTransferCandidateWithinPastDays('2026-03-10', '2026-03-07', 2)).toBe(false)
  })

  it('excludes future candidates', () => {
    expect(isTransferCandidateWithinPastDays('2026-03-10', '2026-03-11', 2)).toBe(false)
  })
})

describe('hasExactTransferCandidateAmount', () => {
  it('treats equal absolute amounts as exact matches', () => {
    expect(hasExactTransferCandidateAmount(42.5, -42.5)).toBe(true)
  })

  it('treats non-equal amounts as non-matches', () => {
    expect(hasExactTransferCandidateAmount(42.5, 40)).toBe(false)
  })
})
