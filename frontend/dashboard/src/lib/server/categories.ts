import { createServiceSupabaseClient } from '@/lib/supabase/service'

export interface CategoryImpactSummary {
  statementTransactions: number
  ledgerEntries: number
  receiptItems: number
  merchantDefaults: number
  merchantMappings: number
  receiptMappings: number
  rules: number
  total: number
}

export interface CategoryMergePreview {
  victimId: number
  survivorId: number
  impact: CategoryImpactSummary
}

export interface CategoryMergeResult {
  victimId: number
  survivorId: number
  impactBefore: CategoryImpactSummary
  moved: CategoryImpactSummary
  impactAfterVictim: CategoryImpactSummary
  impactAfterSurvivor: CategoryImpactSummary
}

export interface CategoryDeleteResult {
  categoryId: number
  deleted: boolean
  blocked: boolean
  impact: CategoryImpactSummary
}

function toImpactSummary(value: unknown): CategoryImpactSummary {
  const payload = (value ?? {}) as Record<string, unknown>
  const read = (key: string) => {
    const next = payload[key]
    if (typeof next === 'number' && Number.isFinite(next)) return next
    if (typeof next === 'string' && next.trim().length > 0) {
      const parsed = Number(next)
      if (Number.isFinite(parsed)) return parsed
    }
    return 0
  }

  return {
    statementTransactions: read('statementTransactions'),
    ledgerEntries: read('ledgerEntries'),
    receiptItems: read('receiptItems'),
    merchantDefaults: read('merchantDefaults'),
    merchantMappings: read('merchantMappings'),
    receiptMappings: read('receiptMappings'),
    rules: read('rules'),
    total: read('total'),
  }
}

export async function previewCategoryMerge(victimId: number, survivorId: number): Promise<CategoryMergePreview> {
  const service = createServiceSupabaseClient()
  const { data, error } = await service.rpc('category_merge_preview', {
    p_victim_id: victimId,
    p_survivor_id: survivorId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to build category merge preview')
  }

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    victimId: Number(payload.victimId ?? victimId),
    survivorId: Number(payload.survivorId ?? survivorId),
    impact: toImpactSummary(payload.impact),
  }
}

export async function mergeCategory(victimId: number, survivorId: number, actorUserId?: string | null): Promise<CategoryMergeResult> {
  const service = createServiceSupabaseClient()
  const { data, error } = await service.rpc('merge_category_safe', {
    p_victim_id: victimId,
    p_survivor_id: survivorId,
    p_actor_user_id: actorUserId ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to merge categories')
  }

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    victimId: Number(payload.victimId ?? victimId),
    survivorId: Number(payload.survivorId ?? survivorId),
    impactBefore: toImpactSummary(payload.impactBefore),
    moved: toImpactSummary(payload.moved),
    impactAfterVictim: toImpactSummary(payload.impactAfterVictim),
    impactAfterSurvivor: toImpactSummary(payload.impactAfterSurvivor),
  }
}

export async function deleteCategory(categoryId: number): Promise<CategoryDeleteResult> {
  const service = createServiceSupabaseClient()
  const { data, error } = await service.rpc('delete_category_safe', {
    p_category_id: categoryId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to delete category')
  }

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    categoryId: Number(payload.categoryId ?? categoryId),
    deleted: Boolean(payload.deleted),
    blocked: Boolean(payload.blocked),
    impact: toImpactSummary(payload.impact),
  }
}
