import { describe, expect, it } from 'vitest'
import { normalizeDirection, normalizeParsedStatement } from '@/lib/statements/helpers'

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

describe('normalizeParsedStatement', () => {
  it('normalizes Citi Ready Credit statements to Citibank loan accounts', () => {
    const normalized = normalizeParsedStatement({
      institution_code: 'unknown',
      institution_name: 'Citibank',
      currency: 'SGD',
      account: {
        account_type: 'credit_card',
        product_name: 'CITIBANK READY CREDIT',
        card_name: 'CITIBANK READY CREDIT',
      },
      transactions: [
        {
          amount: 120,
          account: {
            account_type: 'credit_card',
            product_name: 'CITIBANK READY CREDIT',
          },
        },
      ],
    })

    expect(normalized.institution_code).toBe('citibank')
    expect(normalized.institution_name).toBe('Citibank Singapore Ltd')
    expect(normalized.account?.account_type).toBe('loan')
    expect(normalized.transactions?.[0]?.account?.account_type).toBe('loan')
  })

  it('keeps generic Citi cards as credit cards', () => {
    const normalized = normalizeParsedStatement({
      institution_code: 'unknown',
      institution_name: 'Citibank',
      account: {
        account_type: 'credit_card',
        product_name: 'CITI REWARDS WORLD MASTERCARD',
        card_name: 'CITI REWARDS WORLD MASTERCARD',
      },
    })

    expect(normalized.institution_code).toBe('citibank')
    expect(normalized.account?.account_type).toBe('credit_card')
  })
})
