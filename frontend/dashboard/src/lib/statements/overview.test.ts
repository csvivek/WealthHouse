import { describe, expect, it } from 'vitest'
import {
  buildStatementOverviewCards,
  deriveStatementOverviewBank,
  deriveStatementOverviewType,
} from '@/lib/statements/overview'

describe('statement overview helpers', () => {
  it('groups institution names into stable bank labels', () => {
    expect(deriveStatementOverviewBank({
      institutionCode: 'citibank',
      institutionName: 'Citibank Singapore Ltd',
    })).toEqual({ key: 'citi', label: 'Citi' })

    expect(deriveStatementOverviewBank({
      institutionCode: 'dbs_cc',
      institutionName: 'DBS Bank Ltd',
    })).toEqual({ key: 'dbs', label: 'DBS' })
  })

  it('maps loan and balance-transfer signals into overview types', () => {
    expect(deriveStatementOverviewType({
      accountType: 'loan',
      productName: 'Citibank Ready Credit',
    })).toBe('Credit Line')

    expect(deriveStatementOverviewType({
      accountType: 'loan',
      productName: 'OCBC Balance Transfer Account',
    })).toBe('Balance Transfer')
  })

  it('builds sub-card aggregates, caps previews, and marks legacy downloads unavailable', () => {
    const cards = buildStatementOverviewCards({
      imports: [{
        id: 'import-1',
        file_name: 'dbs-altitude-mar.pdf',
        status: 'committed',
        institution_code: 'dbs_cc',
        statement_date: '2026-03-23',
        statement_period_start: '2026-02-24',
        statement_period_end: '2026-03-23',
        currency: 'SGD',
        raw_parse_result: {
          institution_name: 'DBS Bank Ltd',
          import_label: 'DBS Altitude Card',
          account: {
            account_type: 'credit_card',
            card_name: 'DBS Altitude Visa',
            card_last4: '1234',
          },
          matched_accounts: [{ label: 'DBS Bank Ltd — Altitude Card' }],
        },
        summary_json: {
          credit_limit: 10000,
          minimum_payment: 120,
          payment_due_date: '2026-04-17',
          grand_total: 441.01,
        },
        card_info_json: null,
        total_rows: 6,
        duplicate_rows: 1,
        created_at: '2026-03-24T00:00:00.000Z',
        storage_bucket: null,
        storage_path: null,
      }],
      stagingRows: [
        {
          id: 'row-1',
          file_import_id: 'import-1',
          row_index: 1,
          review_status: 'committed',
          txn_date: '2026-03-21',
          merchant_raw: 'Cold Storage',
          description: 'Cold Storage',
          amount: 42,
          txn_type: 'debit',
          currency: 'SGD',
          original_data: { matchedCardName: 'DBS Altitude Visa', matchedCardLast4: '1234' },
        },
        {
          id: 'row-2',
          file_import_id: 'import-1',
          row_index: 2,
          review_status: 'committed',
          txn_date: '2026-03-20',
          merchant_raw: 'Payment',
          description: 'Payment - DBS Internet',
          amount: 100,
          txn_type: 'credit',
          currency: 'SGD',
          original_data: { matchedCardName: 'DBS Altitude Visa', matchedCardLast4: '1234' },
        },
        {
          id: 'row-3',
          file_import_id: 'import-1',
          row_index: 3,
          review_status: 'committed',
          txn_date: '2026-03-19',
          merchant_raw: 'Grab',
          description: 'Grab',
          amount: 15,
          txn_type: 'debit',
          currency: 'SGD',
          original_data: { matchedCardName: 'DBS Altitude Visa', matchedCardLast4: '1234' },
        },
        {
          id: 'row-4',
          file_import_id: 'import-1',
          row_index: 4,
          review_status: 'committed',
          txn_date: '2026-03-18',
          merchant_raw: 'Spotify',
          description: 'Spotify',
          amount: 11,
          txn_type: 'debit',
          currency: 'SGD',
          original_data: { matchedCardName: 'DBS Altitude Amex', matchedCardLast4: '5678' },
        },
        {
          id: 'row-5',
          file_import_id: 'import-1',
          row_index: 5,
          review_status: 'committed',
          txn_date: '2026-03-17',
          merchant_raw: 'Shopee',
          description: 'Shopee',
          amount: 55,
          txn_type: 'debit',
          currency: 'SGD',
          original_data: { matchedCardName: 'DBS Altitude Amex', matchedCardLast4: '5678' },
        },
        {
          id: 'row-6',
          file_import_id: 'import-1',
          row_index: 6,
          review_status: 'committed',
          txn_date: '2026-03-16',
          merchant_raw: 'Extra',
          description: 'Extra row',
          amount: 9,
          txn_type: 'debit',
          currency: 'SGD',
          original_data: { matchedCardName: 'DBS Altitude Amex', matchedCardLast4: '5678' },
        },
      ],
    })

    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      bankLabel: 'DBS',
      canonicalType: 'Credit Card',
      downloadAvailable: false,
      downloadUnavailableReason: 'Original file unavailable for legacy imports.',
    })
    expect(cards[0].transactions).toHaveLength(5)
    expect(cards[0].subCards).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'DBS Altitude Visa', last4: '1234', netAmount: -43 }),
      expect.objectContaining({ name: 'DBS Altitude Amex', last4: '5678', netAmount: 75 }),
    ]))
  })
})
