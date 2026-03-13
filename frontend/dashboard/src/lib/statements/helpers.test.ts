import { describe, expect, it } from 'vitest'
import { normalizeDirection } from '@/lib/statements/helpers'

describe('normalizeDirection', () => {
  it('treats credit-like statement types as credit', () => {
    expect(normalizeDirection({ statement_type: 'credit_card_payment', amount: 25 })).toBe('credit')
    expect(normalizeDirection({ statement_type: 'refund', amount: 25 })).toBe('credit')
    expect(normalizeDirection({ statement_type: 'reversal', amount: 25 })).toBe('credit')
    expect(normalizeDirection({ statement_type: 'fee_reversal', amount: 25 })).toBe('credit')
  })

  it('treats expense-like statement types as debit', () => {
    expect(normalizeDirection({ statement_type: 'fee', amount: 25 })).toBe('debit')
    expect(normalizeDirection({ statement_type: 'purchase', amount: 25 })).toBe('debit')
    expect(normalizeDirection({ statement_type: 'transfer_out', amount: 25 })).toBe('debit')
    expect(normalizeDirection({ statement_type: 'wallet_topup', amount: 25 })).toBe('debit')
  })

  it('falls back to amount sign when statement type is missing', () => {
    expect(normalizeDirection({ amount: 25 })).toBe('debit')
    expect(normalizeDirection({ amount: -25 })).toBe('credit')
    expect(normalizeDirection({ amount: 0 })).toBe('unknown')
  })
})
