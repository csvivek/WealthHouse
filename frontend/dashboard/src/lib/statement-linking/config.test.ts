import { describe, expect, it } from 'vitest'
import {
  isApprovedMappingStatus,
  isInvalidMappingStatusValueError,
  isStatementLinkingSchemaNotReadyError,
  rewriteApprovedMappingStatus,
} from '@/lib/statement-linking/config'

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

  it('recognizes approved mapping status aliases', () => {
    expect(isApprovedMappingStatus('confirmed')).toBe(true)
    expect(isApprovedMappingStatus('approved')).toBe(true)
    expect(isApprovedMappingStatus('auto_approved')).toBe(true)
    expect(isApprovedMappingStatus('rejected')).toBe(false)
  })

  it('detects invalid confirmed mapping status enum errors', () => {
    expect(
      isInvalidMappingStatusValueError(
        {
          code: '22P02',
          message: 'invalid input value for enum mapping_status: "confirmed"',
        },
        'confirmed',
      ),
    ).toBe(true)
  })

  it('rewrites approved statuses to the database-compatible approved value', () => {
    expect(rewriteApprovedMappingStatus('confirmed', 'approved')).toBe('approved')
    expect(rewriteApprovedMappingStatus('auto_approved', 'approved')).toBe('approved')
    expect(rewriteApprovedMappingStatus('needs_review', 'approved')).toBe('needs_review')
  })
})
