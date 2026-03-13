import { describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { AccountCandidate } from '@/lib/server/statement-import'
import { resolveAccountCandidate } from '@/lib/server/statement-import'

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
})
