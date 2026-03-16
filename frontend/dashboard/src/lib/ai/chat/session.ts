import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { ChatAccountSummary, ChatCoverageRange, ChatSessionPayload } from '@/lib/ai/chat/types'

type ServerSupabaseClient = SupabaseClient<Database>

const DEFAULT_PROMPT_CHIPS = [
  "What's my net worth today?",
  'How much did I spend on food this month?',
  'Show me my top merchants last month',
  'What are my outstanding advances?',
  'How did my spending compare to last month?',
  'What subscriptions am I currently paying for?',
  'Did I save money last month?',
  "What's my total credit card outstanding?",
]

function flattenInstitution(
  value:
    | { name: string | null }
    | { name: string | null }[]
    | null
    | undefined,
) {
  if (!value) return null
  if (Array.isArray(value)) return value[0]?.name ?? null
  return value.name ?? null
}

async function loadCoverageRange(
  runQuery: (ascending: boolean) => Promise<{ date: string | null } | null>,
): Promise<ChatCoverageRange> {
  const [startRow, endRow] = await Promise.all([
    runQuery(true),
    runQuery(false),
  ])

  return {
    start: startRow?.date ?? null,
    end: endRow?.date ?? null,
  }
}

export async function buildChatSessionPayload(params: {
  supabase: ServerSupabaseClient
  userId: string
  householdId: string
}): Promise<ChatSessionPayload> {
  const { supabase, userId, householdId } = params

  const { data: profileData } = await supabase
    .from('user_profiles')
    .select('display_name, households(name, base_currency)')
    .eq('id', userId)
    .single()
  const profile = profileData as {
    display_name: string | null
    households:
      | {
          name: string | null
          base_currency: string | null
        }
      | Array<{
          name: string | null
          base_currency: string | null
        }>
      | null
  } | null

  const { data: accountRows } = await supabase
    .from('accounts')
    .select('id, product_name, nickname, identifier_hint, account_type, currency, institutions(name)')
    .eq('household_id', householdId)
    .order('product_name', { ascending: true })

  const accounts: ChatAccountSummary[] = ((accountRows ?? []) as Array<{
    id: string
    product_name: string
    nickname: string | null
    identifier_hint: string | null
    account_type: string
    currency: string
    institutions: { name: string | null } | { name: string | null }[] | null
  }>).map((account) => ({
    id: account.id,
    name: account.nickname?.trim() || account.product_name,
    productName: account.product_name,
    nickname: account.nickname,
    institutionName: flattenInstitution(account.institutions),
    identifierHint: account.identifier_hint,
    accountType: account.account_type,
    currency: account.currency || 'SGD',
  }))

  const accountIds = accounts.map((account) => account.id)

  const transactions = accountIds.length === 0
    ? { start: null, end: null }
    : await loadCoverageRange(async (ascending) => {
        const { data } = await supabase
          .from('statement_transactions')
          .select('txn_date')
          .in('account_id', accountIds)
          .order('txn_date', { ascending })
          .limit(1)
          .maybeSingle()
        const row = data as { txn_date: string } | null

        return row ? { date: row.txn_date } : null
      })

  const ledger = accountIds.length === 0
    ? { start: null, end: null }
    : await loadCoverageRange(async (ascending) => {
        const { data } = await supabase
          .from('ledger_entries')
          .select('entry_date')
          .in('payment_account_id', accountIds)
          .order('entry_date', { ascending })
          .limit(1)
          .maybeSingle()
        const row = data as { entry_date: string } | null

        return row ? { date: row.entry_date } : null
      })

  const statementSummaries = accountIds.length === 0
    ? { start: null, end: null }
    : await loadCoverageRange(async (ascending) => {
        const { data } = await supabase
          .from('statement_summaries')
          .select('statement_date')
          .in('account_id', accountIds)
          .order('statement_date', { ascending })
          .limit(1)
          .maybeSingle()
        const row = data as { statement_date: string } | null

        return row ? { date: row.statement_date } : null
      })

  const household = Array.isArray(profile?.households)
    ? profile?.households[0] ?? null
    : profile?.households ?? null

  return {
    userDisplayName: profile?.display_name ?? null,
    householdId,
    householdName: household?.name ?? null,
    baseCurrency: household?.base_currency || 'SGD',
    accounts,
    promptChips: DEFAULT_PROMPT_CHIPS,
    coverage: {
      transactions,
      ledger,
      statementSummaries,
    },
  }
}
