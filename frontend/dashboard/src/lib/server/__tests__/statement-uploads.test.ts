import { describe, expect, it } from 'vitest'
import {
  listStatementUploadImportsFromResultPayload,
  readStatementUploadImportCount,
} from '@/lib/server/statement-uploads'

describe('statement upload helpers', () => {
  it('reads import summaries from a completed result payload', () => {
    expect(listStatementUploadImportsFromResultPayload({
      resultPayload: {
        status: 'completed',
        imports: [{
          importId: 'import-1',
          importLabel: 'DBS — Savings',
          accountLabel: 'DBS — Savings',
          reviewUrl: '/statements/review/import-1',
          status: 'in_review',
        }],
      },
      fallbackFileName: 'statement.pdf',
      fallbackStatus: 'completed',
    })).toEqual([{
      importId: 'import-1',
      importLabel: 'DBS — Savings',
      accountLabel: 'DBS — Savings',
      reviewUrl: '/statements/review/import-1',
      status: 'in_review',
    }])
  })

  it('builds a single review import from reviewUrl when imports are missing', () => {
    expect(listStatementUploadImportsFromResultPayload({
      resultPayload: {
        status: 'completed',
        importCount: 1,
        reviewUrl: '/statements/review/import-1',
      },
      fallbackFileName: 'statement.pdf',
      fallbackStatus: 'in_review',
    })).toEqual([{
      importId: 'import-1',
      importLabel: 'statement.pdf',
      accountLabel: null,
      reviewUrl: '/statements/review/import-1',
      status: 'in_review',
    }])
  })

  it('reads the stored import count from the result payload', () => {
    expect(readStatementUploadImportCount({ importCount: 2 })).toBe(2)
    expect(readStatementUploadImportCount({ importCount: '2' })).toBeNull()
  })
})
