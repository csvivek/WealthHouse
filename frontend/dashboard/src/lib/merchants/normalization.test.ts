import { describe, expect, it } from 'vitest'
import {
  cleanMerchantSourceText,
  deriveMerchantDisplayName,
  normalizeMerchantAlias,
  normalizeMerchantCanonicalName,
} from '@/lib/merchants/normalization'

describe('merchant normalization', () => {
  it('collapses punctuation and repeated whitespace for aliases', () => {
    expect(normalizeMerchantAlias("  McDonald's   Singapore!!  ")).toBe("mcdonald's")
  })

  it('strips obvious store numbers and branch suffixes from canonical names', () => {
    expect(normalizeMerchantCanonicalName('MCDONALDS #2341')).toBe('mcdonalds')
    expect(normalizeMerchantCanonicalName('Starbucks - Plaza Sing')).toBe('starbucks')
  })

  it('removes legal suffixes conservatively', () => {
    expect(normalizeMerchantCanonicalName('NTUC Fairprice Pte Ltd')).toBe('ntuc fairprice')
  })

  it('preserves distinct merchants when the text does not contain safe branch markers', () => {
    expect(normalizeMerchantCanonicalName('McDonalds Anchorvale Crescent')).toBe('mcdonalds anchorvale crescent')
  })

  it('derives a readable display name from the cleaned canonical merchant', () => {
    expect(cleanMerchantSourceText('STARBUCKS - Plaza Sing')).toBe('STARBUCKS')
    expect(deriveMerchantDisplayName('STARBUCKS - Plaza Sing')).toBe('Starbucks')
  })
})
