import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type AppSupabaseClient = SupabaseClient<Database>
export type AccountType = Database['public']['Enums']['account_type']

interface InstitutionOptions {
  institutionId?: string | null
  institutionCode?: string | null
  institutionName?: string | null
  countryCode?: string | null
}

interface CreateAccountOptions {
  householdId: string
  institutionId: string
  accountType: string
  productName: string
  nickname?: string | null
  identifierHint?: string | null
  currency?: string | null
  cardName?: string | null
  cardLast4?: string | null
}

const KNOWN_INSTITUTIONS: Record<string, { name: string; countryCode: string; type: Database['public']['Enums']['institution_type'] }> = {
  dbs_bank: { name: 'DBS Bank Ltd', countryCode: 'SG', type: 'bank' },
  dbs_cc: { name: 'DBS Bank Ltd', countryCode: 'SG', type: 'bank' },
  ocbc: { name: 'OCBC Bank', countryCode: 'SG', type: 'bank' },
  uob: { name: 'UOB', countryCode: 'SG', type: 'bank' },
  posb: { name: 'POSB', countryCode: 'SG', type: 'bank' },
  trust_bank: { name: 'Trust Bank', countryCode: 'SG', type: 'bank' },
  wise: { name: 'Wise', countryCode: 'SG', type: 'other' },
}

export function normalizeAccountType(raw?: string | null): AccountType {
  const value = (raw ?? '').toLowerCase().trim()

  if (value.includes('credit')) return 'credit_card'
  if (value.includes('card')) return 'credit_card'
  if (value.includes('crypto')) return 'crypto_exchange'
  if (value.includes('exchange')) return 'crypto_exchange'
  if (value.includes('invest')) return 'investment'
  if (value.includes('loan')) return 'loan'
  if (value.includes('deposit')) return 'fixed_deposit'
  if (value.includes('current')) return 'current'

  return 'savings'
}

export function normalizeInstitutionMetadata(options: InstitutionOptions) {
  const key = (options.institutionCode ?? '').toLowerCase().trim()
  const known = key ? KNOWN_INSTITUTIONS[key] : null

  return {
    name: options.institutionName?.trim() || known?.name || 'Manual Institution',
    countryCode: options.countryCode?.trim() || known?.countryCode || 'SG',
    type: known?.type || 'bank',
  }
}

export async function findOrCreateInstitution(
  supabase: AppSupabaseClient,
  options: InstitutionOptions,
) {
  if (options.institutionId) {
    const { data: existing } = await supabase
      .from('institutions')
      .select('id, name, country_code')
      .eq('id', options.institutionId)
      .single()

    if (existing) {
      return existing
    }
  }

  const normalized = normalizeInstitutionMetadata(options)

  const { data: byName } = await supabase
    .from('institutions')
    .select('id, name, country_code')
    .ilike('name', normalized.name)
    .limit(1)
    .maybeSingle()

  if (byName) {
    return byName
  }

  const { data: created, error } = await supabase
    .from('institutions')
    .insert({
      name: normalized.name,
      type: normalized.type,
      country_code: normalized.countryCode,
    })
    .select('id, name, country_code')
    .single()

  if (error || !created) {
    throw new Error(error?.message || 'Failed to create institution')
  }

  return created
}

export async function createAccountWithRelatedRecords(
  supabase: AppSupabaseClient,
  options: CreateAccountOptions,
) {
  const accountType = normalizeAccountType(options.accountType)

  const { data: account, error } = await supabase
    .from('accounts')
    .insert({
      household_id: options.householdId,
      institution_id: options.institutionId,
      account_type: accountType,
      product_name: options.productName,
      nickname: options.nickname ?? null,
      identifier_hint: options.identifierHint ?? null,
      currency: options.currency || 'SGD',
    })
    .select('id, product_name, nickname, account_type, institution_id, currency, identifier_hint, is_active')
    .single()

  if (error || !account) {
    throw new Error(error?.message || 'Failed to create account')
  }

  if (accountType === 'credit_card') {
    const last4 = (options.cardLast4 || options.identifierHint || '0000').slice(-4).padStart(4, '0')
    await supabase.from('cards').upsert({
      account_id: account.id,
      card_name: options.cardName || options.productName,
      card_last4: last4,
    })
  }

  if (accountType === 'crypto_exchange') {
    await supabase.from('exchange_accounts').upsert({
      account_id: account.id,
      exchange_name: options.productName,
      account_label: options.nickname ?? options.productName,
    })
  }

  return account
}
