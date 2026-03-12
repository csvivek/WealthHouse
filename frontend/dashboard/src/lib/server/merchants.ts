import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { MerchantImpactSummary } from '@/lib/server/merchant-service'

export interface MerchantMergePreview {
  victimId: string
  survivorId: string
  impact: MerchantImpactSummary
}

export interface MerchantMergeResult {
  victimId: string
  survivorId: string
  impactBefore: MerchantImpactSummary
  moved: MerchantImpactSummary
  impactAfterVictim: MerchantImpactSummary
  impactAfterSurvivor: MerchantImpactSummary
}

export interface MerchantDeleteResult {
  merchantId: string
  deleted: boolean
  blocked: boolean
  impact: MerchantImpactSummary
}

function toImpactSummary(value: unknown): MerchantImpactSummary {
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
    aliases: read('aliases'),
    statementTransactions: read('statementTransactions'),
    receipts: read('receipts'),
    ledgerEntries: read('ledgerEntries'),
    receiptKnowledge: read('receiptKnowledge'),
    categorizationAudits: read('categorizationAudits'),
    groceryPurchases: read('groceryPurchases'),
    total: read('total'),
  }
}

export async function previewMerchantMerge(victimId: string, survivorId: string): Promise<MerchantMergePreview> {
  const service = createServiceSupabaseClient()
  const { data, error } = await service.rpc('merchant_merge_preview', {
    p_victim_id: victimId,
    p_survivor_id: survivorId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to build merchant merge preview')
  }

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    victimId: String(payload.victimId ?? victimId),
    survivorId: String(payload.survivorId ?? survivorId),
    impact: toImpactSummary(payload.impact),
  }
}

export async function mergeMerchant(victimId: string, survivorId: string, actorUserId?: string | null): Promise<MerchantMergeResult> {
  const service = createServiceSupabaseClient()
  const { data, error } = await service.rpc('merge_merchant_safe', {
    p_victim_id: victimId,
    p_survivor_id: survivorId,
    p_actor_user_id: actorUserId ?? null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to merge merchants')
  }

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    victimId: String(payload.victimId ?? victimId),
    survivorId: String(payload.survivorId ?? survivorId),
    impactBefore: toImpactSummary(payload.impactBefore),
    moved: toImpactSummary(payload.moved),
    impactAfterVictim: toImpactSummary(payload.impactAfterVictim),
    impactAfterSurvivor: toImpactSummary(payload.impactAfterSurvivor),
  }
}

export async function deleteMerchant(merchantId: string): Promise<MerchantDeleteResult> {
  const service = createServiceSupabaseClient()
  const { data, error } = await service.rpc('delete_merchant_safe', {
    p_merchant_id: merchantId,
  })

  if (error) {
    throw new Error(error.message || 'Failed to delete merchant')
  }

  const payload = (data ?? {}) as Record<string, unknown>
  return {
    merchantId: String(payload.merchantId ?? merchantId),
    deleted: Boolean(payload.deleted),
    blocked: Boolean(payload.blocked),
    impact: toImpactSummary(payload.impact),
  }
}
