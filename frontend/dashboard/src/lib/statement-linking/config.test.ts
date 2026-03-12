import { describe, expect, it } from 'vitest'
import { isStatementLinkingSchemaNotReadyError } from '@/lib/statement-linking/config'

describe('statement linking schema helpers', () => {
  it('detects missing staging link columns from schema cache', () => {
    expect(
      isStatementLinkingSchemaNotReadyError({
        message: "Could not find the 'status' column of 'staging_transaction_links' in the schema cache",
      }),
    ).toBe(true)
  })

  it('detects missing transaction link upsert support', () => {
    expect(
      isStatementLinkingSchemaNotReadyError(
        {
          code: '42P10',
          message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification',
        },
        'transaction_links',
      ),
    ).toBe(true)
  })
})
