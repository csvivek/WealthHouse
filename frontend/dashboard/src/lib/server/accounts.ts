import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canonicalizeInstitutionName,
  getKnownInstitutionMetadata,
  normalizeAccountType as normalizeSharedAccountType,
} from '@/lib/accounts/normalization'
import type { Database } from '@/types/database'

export type AppSupabaseClient = SupabaseClient
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

interface UpdateAccountOptions {
  householdId: string
  accountId: string
  institutionName: string
  productName: string
  nickname?: string | null
  identifierHint?: string | null
  currency?: string | null
  isActive?: boolean
  cardName?: string | null
  cardLast4?: string | null
  accountType?: string | null
}

export class AccountMutationError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AccountMutationError'
    this.status = status
  }
}

function normalizeCardLast4(cardLast4?: string | null, identifierHint?: string | null) {
  const digits = (cardLast4 ?? identifierHint ?? '').replace(/\D/g, '')
  return digits ? digits.slice(-4).padStart(4, '0') : '0000'
}

export function normalizeAccountType(raw?: string | null, extraValues: Array<string | null | undefined> = []): AccountType {
  return normalizeSharedAccountType(raw, extraValues) as AccountType
}

export function normalizeInstitutionMetadata(options: InstitutionOptions) {
  const known = getKnownInstitutionMetadata(options.institutionCode, [options.institutionName])
  const canonicalName = canonicalizeInstitutionName({
    institutionCode: options.institutionCode,
    institutionName: options.institutionName,
  })

  return {
    name: canonicalName || 'Manual Institution',
    countryCode: options.countryCode?.trim() || known?.countryCode || 'SG',
    type: (known?.type || 'bank') as Database['public']['Enums']['institution_type'],
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
  const accountType = normalizeAccountType(options.accountType, [options.productName, options.cardName])

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
    const last4 = normalizeCardLast4(options.cardLast4, options.identifierHint)
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

export async function updateAccountWithRelatedRecords(
  supabase: AppSupabaseClient,
  options: UpdateAccountOptions,
) {
  const { data: existing, error: existingError } = await supabase
    .from('accounts')
    .select('id, account_type, product_name, nickname, identifier_hint, currency, institution_id, is_active')
    .eq('id', options.accountId)
    .eq('household_id', options.householdId)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message || 'Failed to load account')
  }

  if (!existing) {
    throw new AccountMutationError('Account not found', 404)
  }

  if (options.accountType) {
    const requestedType = normalizeAccountType(options.accountType)
    if (requestedType !== existing.account_type) {
      throw new AccountMutationError('Account type cannot be changed.', 400)
    }
  }

  const institution = await findOrCreateInstitution(supabase, {
    institutionName: options.institutionName,
  })

  const { data: account, error: updateError } = await supabase
    .from('accounts')
    .update({
      institution_id: institution.id,
      product_name: options.productName,
      nickname: options.nickname ?? null,
      identifier_hint: options.identifierHint ?? null,
      currency: options.currency || 'SGD',
      is_active: typeof options.isActive === 'boolean' ? options.isActive : existing.is_active,
    })
    .eq('id', options.accountId)
    .eq('household_id', options.householdId)
    .select('id, product_name, nickname, account_type, institution_id, currency, identifier_hint, is_active')
    .single()

  if (updateError || !account) {
    throw new Error(updateError?.message || 'Failed to update account')
  }

  if (existing.account_type === 'credit_card') {
    const last4 = normalizeCardLast4(options.cardLast4, options.identifierHint)
    await supabase.from('cards').upsert({
      account_id: account.id,
      card_name: options.cardName || options.productName,
      card_last4: last4,
    })
  }

  if (existing.account_type === 'crypto_exchange') {
    await supabase.from('exchange_accounts').upsert({
      account_id: account.id,
      exchange_name: options.productName,
      account_label: options.nickname ?? options.productName,
    })
  }

  return { account, institution }
}
