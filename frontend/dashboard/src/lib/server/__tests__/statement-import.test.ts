import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { AccountCandidate } from '@/lib/server/statement-import'
import { findSuggestedExistingAccount, resolveAccountCandidate } from '@/lib/server/statement-import'

vi.mock('@/lib/knowledge/merchant-intelligence', () => ({
  resolveMerchantCategory: vi.fn(),
}))

vi.mock('@/lib/tags/suggestions', () => ({
  suggestTags: vi.fn(),
}))

function createCandidate(overrides: Partial<AccountCandidate>): AccountCandidate {
  return {
    id: 'acct-1',
    institution_id: 'inst-1',
    product_name: 'Account',
    nickname: null,
    identifier_hint: null,
    account_type: 'savings',
    institutions: { name: 'Citibank Singapore Ltd' },
    cards: null,
    ...overrides,
  }
}

describe('resolveAccountCandidate', () => {
  it('does not auto-match Ready Credit to an unrelated Citi card with only weak institution evidence', () => {
    const rewardsCard = createCandidate({
      id: 'acct-card',
      product_name: 'CITI REWARDS WORLD MASTERCARD',
      nickname: 'Citi Rewards Card',
      identifier_hint: '5425...4615',
      account_type: 'credit_card',
      cards: [{ id: 'card-1', card_name: 'CITI REWARDS WORLD MASTERCARD', card_last4: '4615' }],
    })

    const result = resolveAccountCandidate({
      candidates: [rewardsCard],
      institutionName: 'Citibank Singapore Ltd',
      descriptor: {
        account_type: 'credit_card',
        product_name: 'CITIBANK READY CREDIT',
        card_name: 'CITIBANK READY CREDIT',
        identifier_hint: '1-905379-255',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      error: 'No confident account match found.',
    }))
  })

  it('still auto-matches when a strong card signal exists', () => {
    const rewardsCard = createCandidate({
      id: 'acct-card',
      product_name: 'CITI REWARDS WORLD MASTERCARD',
      nickname: 'Citi Rewards Card',
      identifier_hint: '5425...4615',
      account_type: 'credit_card',
      cards: [{ id: 'card-1', card_name: 'CITI REWARDS WORLD MASTERCARD', card_last4: '4615' }],
    })

    const result = resolveAccountCandidate({
      candidates: [rewardsCard],
      institutionName: 'Citibank Singapore Ltd',
      descriptor: {
        account_type: 'credit_card',
        product_name: 'CITI REWARDS WORLD MASTERCARD',
        card_name: 'CITI REWARDS WORLD MASTERCARD',
        card_last4: '4615',
      },
    })

    expect(result).toEqual(expect.objectContaining({
      account: expect.objectContaining({
        id: 'acct-card',
        label: 'Citibank Singapore Ltd — Citi Rewards Card',
      }),
    }))
  })

  it('does not auto-match between multiple DBS savings accounts without a strong identifier', () => {
    const dbsPrimary = createCandidate({
      id: 'acct-dbs-1',
      product_name: 'My Account',
      nickname: 'DBS Savings 1',
      identifier_hint: '2211',
      account_type: 'savings',
      institutions: { name: 'DBS Bank Ltd' },
    })
    const dbsJoint = createCandidate({
      id: 'acct-dbs-2',
      product_name: 'My Account',
      nickname: 'DBS Savings 2',
      identifier_hint: '7788',
      account_type: 'savings',
      institutions: { name: 'DBS Bank Ltd' },
    })
    const dbsReserve = createCandidate({
      id: 'acct-dbs-3',
      product_name: 'Multiplier Account',
      nickname: 'DBS Savings 3',
      identifier_hint: '9922',
      account_type: 'savings',
      institutions: { name: 'DBS Bank Ltd' },
    })

    const result = resolveAccountCandidate({
      candidates: [dbsPrimary, dbsJoint, dbsReserve],
      institutionName: 'DBS Bank Ltd',
      descriptor: {
        account_type: 'savings',
        product_name: 'Savings Account',
        identifier_hint: null,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      error: expect.stringMatching(/more than one account|No confident account match found\./),
    }))
  })

  it('does not preselect a suggested DBS deposit account when multiple accounts are plausible', () => {
    const dbsSavings = createCandidate({
      id: 'acct-dbs-savings',
      product_name: 'DBS Savings Plus',
      nickname: 'Operations',
      identifier_hint: '0256041461',
      account_type: 'savings',
      institutions: { name: 'DBS Bank Ltd' },
    })
    const dbsMultiplier = createCandidate({
      id: 'acct-dbs-multi',
      product_name: 'Multiplier Account',
      nickname: 'MultiCurrency',
      identifier_hint: '1202417290',
      account_type: 'savings',
      institutions: { name: 'DBS Bank Ltd' },
    })
    const dbsMySavings = createCandidate({
      id: 'acct-dbs-my-savings',
      product_name: 'My Savings Account',
      nickname: '',
      identifier_hint: null,
      account_type: 'savings',
      institutions: { name: 'DBS Bank Ltd' },
    })

    const suggestion = findSuggestedExistingAccount({
      candidates: [dbsSavings, dbsMultiplier, dbsMySavings],
      institutionName: 'DBS Bank Ltd',
      descriptor: {
        account_type: 'savings',
        product_name: 'DBS Savings Account',
        identifier_hint: '0461',
      },
    })

    expect(suggestion).toBeNull()
  })
})
