import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { buildStagingCandidatePairs } from './candidates'
import { rewriteApprovedMappingStatus, withApprovedMappingStatusFallback } from './config'
import { scoreCandidate } from './scoring'
import type { SuggestedLink } from './types'

type ServiceClient = SupabaseClient
type StagingLinkInsert = Database['public']['Tables']['staging_transaction_links']['Insert']

const AUTO_APPROVE_THRESHOLD = 0.86
const SUGGEST_THRESHOLD = 0.6

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

  const [{ data: stagingRows }, { data: committedRows }] = await Promise.all([
    supabase
      .from('import_staging')
      .select('*')
      .eq('file_import_id', fileImportId),
    supabase
      .from('statement_transactions')
      .select('*')
      .in('account_id', accountIds.length ? accountIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('txn_date', new Date(Date.now() - (45 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10)),
  ])

  const accountTypeById = new Map((accounts ?? []).map((row) => [row.id, row.account_type]))

  await supabase
    .from('staging_transaction_links')
    .delete()
    .eq('file_import_id', fileImportId)
    .eq('matched_by', 'system')
    .eq('status', 'needs_review')

  const inserts: StagingLinkInsert[] = []

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
        inserts.push({
          file_import_id: fileImportId,
          household_id: householdId,
          from_staging_id: suggestion.fromStagingId,
          to_staging_id: suggestion.toStagingId,
          to_transaction_id: suggestion.toTransactionId,
          link_type: suggestion.linkType,
          link_score: suggestion.linkScore,
          link_reason: suggestion.linkReason,
          status: suggestion.status as Database['public']['Enums']['mapping_status'],
          matched_by: suggestion.matchedBy,
          matched_by_user_id: actorUserId ?? null,
        })
      }
  }

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
