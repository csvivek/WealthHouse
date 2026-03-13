import { describe, expect, it } from 'vitest'
import { normalizeTxnDirection } from '@/lib/transactions/txn-direction'

describe('normalizeTxnDirection', () => {
  it('treats semantic income-like transaction types as credit', () => {
    expect(normalizeTxnDirection('payment')).toBe('credit')
    expect(normalizeTxnDirection('refund')).toBe('credit')
    expect(normalizeTxnDirection('fee_reversal')).toBe('credit')
  })

  it('treats semantic spend-like transaction types as debit', () => {
    expect(normalizeTxnDirection('purchase')).toBe('debit')
    expect(normalizeTxnDirection('fee')).toBe('debit')
    expect(normalizeTxnDirection('wallet_topup')).toBe('debit')
  })
})
