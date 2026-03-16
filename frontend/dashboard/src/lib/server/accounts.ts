import type { SupabaseClient } from '@supabase/supabase-js'
import {
  canonicalizeInstitutionName,
  getKnownInstitutionMetadata,
  normalizeAccountType as normalizeSharedAccountType,
} from '@/lib/accounts/normalization'
import { resolveInstitutionBrandPreview } from '@/lib/server/institution-branding'
import type { Database } from '@/types/database'

export type AppSupabaseClient = SupabaseClient
export type AccountType = Database['public']['Enums']['account_type']
export type InstitutionBrandDecision = 'verified' | 'generic'

interface InstitutionOptions {
  institutionId?: string | null
  institutionCode?: string | null
  institutionName?: string | null
  countryCode?: string | null
  institutionBrandCode?: string | null
  institutionBrandDecision?: InstitutionBrandDecision | null
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
  institutionBrandCode?: string | null
  institutionBrandDecision?: InstitutionBrandDecision | null
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

async function resolveSelectedInstitutionBrand(options: InstitutionOptions) {
  if (options.institutionBrandDecision !== 'verified') {
    return null
  }

  return resolveInstitutionBrandPreview({
    brandCode: options.institutionBrandCode,
    institutionCode: options.institutionCode,
    institutionName: options.institutionName,
  })
}

export async function normalizeInstitutionMetadata(options: InstitutionOptions) {
  const known = getKnownInstitutionMetadata(
    options.institutionBrandCode || options.institutionCode,
    [options.institutionName],
  )
  const selectedBrand = await resolveSelectedInstitutionBrand(options)
  const typedName = options.institutionName?.trim()
  const canonicalName = selectedBrand?.canonicalName
    || (options.institutionBrandDecision === 'verified'
      ? canonicalizeInstitutionName({
        institutionCode: options.institutionCode,
        institutionName: options.institutionName,
      })
      : typedName)

  return {
    name: canonicalName || 'Manual Institution',
    countryCode: options.countryCode?.trim() || known?.countryCode || 'SG',
    type: ((known?.type || 'bank') as Database['public']['Enums']['institution_type']),
    websiteUrl: selectedBrand?.websiteUrl ?? null,
    iconUrl: selectedBrand?.iconUrl ?? null,
  }
}

async function maybeUpdateInstitutionBranding(
  supabase: AppSupabaseClient,
  institutionId: string,
  normalized: Awaited<ReturnType<typeof normalizeInstitutionMetadata>>,
) {
  if (!normalized.websiteUrl && !normalized.iconUrl) return null

  const { data: updated, error } = await supabase
    .from('institutions')
    .update({
      website_url: normalized.websiteUrl,
      icon_url: normalized.iconUrl,
    })
    .eq('id', institutionId)
    .select('id, name, country_code, website_url, icon_url')
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update institution branding')
  }

  return updated
}

export async function findOrCreateInstitution(
  supabase: AppSupabaseClient,
  options: InstitutionOptions,
) {
  const normalized = await normalizeInstitutionMetadata(options)

  if (options.institutionId) {
    const { data: existing } = await supabase
      .from('institutions')
      .select('id, name, country_code, website_url, icon_url')
      .eq('id', options.institutionId)
      .single()

    if (existing) {
      return await maybeUpdateInstitutionBranding(supabase, existing.id, normalized) ?? existing
    }
  }

  const { data: byName } = await supabase
    .from('institutions')
    .select('id, name, country_code, website_url, icon_url')
    .ilike('name', normalized.name)
    .limit(1)
    .maybeSingle()

  if (byName) {
    return await maybeUpdateInstitutionBranding(supabase, byName.id, normalized) ?? byName
  }

  const { data: created, error } = await supabase
    .from('institutions')
    .insert({
      name: normalized.name,
      type: normalized.type,
      country_code: normalized.countryCode,
      website_url: normalized.websiteUrl,
      icon_url: normalized.iconUrl,
    })
    .select('id, name, country_code, website_url, icon_url')
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
    institutionBrandCode: options.institutionBrandCode,
    institutionBrandDecision: options.institutionBrandDecision,
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
