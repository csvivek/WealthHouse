import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildStagingCandidatePairs } from './candidates'
import { rewriteApprovedMappingStatus, withApprovedMappingStatusFallback } from './config'
import { scoreCandidate } from './scoring'
import type { SuggestedLink } from './types'

type ServiceClient = SupabaseClient
type StagingLinkInsert = Database['public']['Tables']['staging_transaction_links']['Insert']
type StagingLinkRow = Database['public']['Tables']['staging_transaction_links']['Row']

const AUTO_APPROVE_THRESHOLD = 0.86
const SUGGEST_THRESHOLD = 0.6
const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

function buildStagingLinkKey(link: {
  from_staging_id: string
  to_staging_id?: string | null
  to_transaction_id?: string | null
  link_type: string
}) {
  return [
    link.from_staging_id,
    link.to_staging_id ?? EMPTY_UUID,
    link.to_transaction_id ?? EMPTY_UUID,
    link.link_type,
  ].join('|')
}

function shouldPreserveReviewedSystemLink(link: StagingLinkRow | undefined) {
  if (!link || link.matched_by !== 'system') return false
  return Boolean(link.reviewed_by || link.reviewed_at || link.status === 'rejected')
}

export async function refreshLinkSuggestionsForImport(params: {
  supabase: ServiceClient
  fileImportId: string
  householdId: string
  actorUserId?: string | null
}) {
  const { supabase, fileImportId, householdId, actorUserId } = params

  const [{ data: accounts }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, account_type')
      .eq('household_id', householdId),
  ])

  const accountIds = (accounts ?? []).map((row) => row.id)

  const [{ data: stagingRows }, { data: committedRows }, { data: existingLinks }] = await Promise.all([
    supabase
      .from('import_staging')
      .select('*')
      .eq('file_import_id', fileImportId),
    supabase
      .from('statement_transactions')
      .select('*')
      .in('account_id', accountIds.length ? accountIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('txn_date', new Date(Date.now() - (45 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)),
    supabase
      .from('staging_transaction_links')
      .select('*')
      .eq('file_import_id', fileImportId),
  ])

  const accountTypeById = new Map((accounts ?? []).map((row) => [row.id, row.account_type]))
  const existingSystemLinksByKey = new Map<string, StagingLinkRow>()
  const preservedNonSystemLinkKeys = new Set<string>()

  for (const link of existingLinks ?? []) {
    const key = buildStagingLinkKey(link)
    if (link.matched_by === 'system') {
      existingSystemLinksByKey.set(key, link)
      continue
    }

    preservedNonSystemLinkKeys.add(key)
  }

  const insertsByKey = new Map<string, StagingLinkInsert>()

  for (const source of stagingRows ?? []) {
    const pairs = buildStagingCandidatePairs({
      source,
      stagingRows: stagingRows ?? [],
      committedRows: committedRows ?? [],
      accountTypeById,
    })

    const suggestions = pairs
      .map((pair) => {
        const score = scoreCandidate(pair)
        if (!score.linkType) return null
        if (score.score < SUGGEST_THRESHOLD) return null

        const next: SuggestedLink = {
          fromStagingId: source.id,
          toStagingId: pair.targetKind === 'staging' ? pair.targetId : null,
          toTransactionId: pair.targetKind === 'committed' ? pair.targetId : null,
          linkType: score.linkType,
          linkScore: score.score,
          linkReason: {
            ...score.reason,
            sourceKind: pair.sourceKind,
            targetKind: pair.targetKind,
          },
          status: score.score >= AUTO_APPROVE_THRESHOLD ? 'confirmed' : 'needs_review',
          matchedBy: 'system',
        }
        return next
      })
      .filter((value): value is SuggestedLink => Boolean(value))
      .sort((a, b) => b.linkScore - a.linkScore)
      .slice(0, 5)

    for (const suggestion of suggestions) {
      if (suggestion.toStagingId === source.id) continue
      const key = buildStagingLinkKey({
        from_staging_id: suggestion.fromStagingId,
        to_staging_id: suggestion.toStagingId,
        to_transaction_id: suggestion.toTransactionId,
        link_type: suggestion.linkType,
      })

      if (preservedNonSystemLinkKeys.has(key)) continue

      const existingSystemLink = existingSystemLinksByKey.get(key)
      const preserveReviewedSystemLink = shouldPreserveReviewedSystemLink(existingSystemLink)
      const nextInsert: StagingLinkInsert = {
        file_import_id: fileImportId,
        household_id: householdId,
        from_staging_id: suggestion.fromStagingId,
        to_staging_id: suggestion.toStagingId,
        to_transaction_id: suggestion.toTransactionId,
        link_type: suggestion.linkType,
        link_score: suggestion.linkScore,
        link_reason: suggestion.linkReason,
        status: (
          preserveReviewedSystemLink
            ? existingSystemLink?.status ?? suggestion.status
            : suggestion.status
        ) as Database['public']['Enums']['mapping_status'],
        matched_by: suggestion.matchedBy,
        matched_by_user_id: existingSystemLink?.matched_by_user_id ?? actorUserId ?? null,
        reviewed_by: preserveReviewedSystemLink ? existingSystemLink?.reviewed_by ?? null : null,
        reviewed_at: preserveReviewedSystemLink ? existingSystemLink?.reviewed_at ?? null : null,
      }

      const previousInsert = insertsByKey.get(key)
      if (!previousInsert || Number(nextInsert.link_score ?? 0) > Number(previousInsert.link_score ?? 0)) {
        insertsByKey.set(key, nextInsert)
      }
    }
  }

  await supabase
    .from('staging_transaction_links')
    .delete()
    .eq('file_import_id', fileImportId)
    .eq('matched_by', 'system')

  const inserts = Array.from(insertsByKey.values())

  if (inserts.length > 0) {
    const result = await withApprovedMappingStatusFallback((approvedStatus) => (
      supabase
        .from('staging_transaction_links')
        .insert(
          inserts.map((insert) => ({
            ...insert,
            status: (rewriteApprovedMappingStatus(insert.status, approvedStatus) ?? 'needs_review') as Database['public']['Enums']['mapping_status'],
          })),
        )
    ))

    if (result.error) {
      throw result.error
    }
  }
}
