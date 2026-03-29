import { describe, expect, it } from 'vitest'
import {
  isReceiptCsvImportSchemaNotReadyError,
  isReceiptMerchantContactSchemaNotReadyError,
} from '@/lib/receipts/config'

describe('isReceiptCsvImportSchemaNotReadyError', () => {
  it('detects missing receipt_uploads CSV metadata columns', () => {
    expect(isReceiptCsvImportSchemaNotReadyError({
      message: 'column receipt_uploads.import_source does not exist',
    }, 'receipt_uploads')).toBe(true)

    expect(isReceiptCsvImportSchemaNotReadyError({
      message: 'column public.receipt_uploads.csv_batch_id does not exist',
    }, 'receipt_uploads')).toBe(true)
  })

  it('ignores unrelated errors', () => {
    expect(isReceiptCsvImportSchemaNotReadyError({
      message: 'column receipt_uploads.original_filename does not exist',
    }, 'receipt_uploads')).toBe(false)
  })
})

describe('isReceiptMerchantContactSchemaNotReadyError', () => {
  it('detects missing merchant contact columns on receipt staging tables', () => {
    expect(isReceiptMerchantContactSchemaNotReadyError({
      message: "Could not find the 'merchant_address' column of 'receipt_staging_transactions' in the schema cache",
    }, 'receipt_staging_transactions')).toBe(true)

    expect(isReceiptMerchantContactSchemaNotReadyError({
      message: 'column public.receipts.merchant_phone does not exist',
    }, 'receipts')).toBe(true)
  })

  it('ignores unrelated receipt schema errors', () => {
    expect(isReceiptMerchantContactSchemaNotReadyError({
      message: 'column receipt_staging_transactions.payment_type does not exist',
    }, 'receipt_staging_transactions')).toBe(false)
  })
})
