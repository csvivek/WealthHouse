import { describe, expect, it } from 'vitest'
import {
  MERCHANT_ERROR_CODES,
  isMerchantSchemaNotReadyError,
  merchantSchemaNotReadyResponse,
} from '@/lib/merchants/config'

describe('merchant schema helpers', () => {
  it('detects missing merchant household scope columns', () => {
    expect(
      isMerchantSchemaNotReadyError({
        message: 'column merchants.household_id does not exist',
      }),
    ).toBe(true)
  })

  it('detects missing merchant relationships from schema cache', () => {
    expect(
      isMerchantSchemaNotReadyError({
        code: 'PGRST200',
        message: "Could not find a relationship between 'receipts' and 'merchants' in the schema cache",
      }),
    ).toBe(true)
  })

  it('returns a migration action for merchant schema readiness errors', () => {
    expect(merchantSchemaNotReadyResponse()).toEqual({
      error: 'Merchant management schema is not deployed in this Supabase environment.',
      code: MERCHANT_ERROR_CODES.SCHEMA_NOT_READY,
      action: 'Run migration `016_merchant_management.sql` so table `public.merchants` exists.',
    })
  })
})
