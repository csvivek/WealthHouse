import { NextRequest, NextResponse } from 'next/server'
import { merchantApiErrorPayload, isMerchantSchemaNotReadyError, merchantSchemaNotReadyResponse } from '@/lib/merchants/config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import { mergeMerchant, previewMerchantMerge } from '@/lib/server/merchants'

async function getHouseholdContext() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase.from('user_profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return null

  return { userId: user.id, householdId: profile.household_id }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getHouseholdContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: survivorId } = await params
    const body = await request.json()
    const victimIds = Array.isArray(body?.victimIds)
      ? body.victimIds.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : []

    if (victimIds.length === 0) {
      return NextResponse.json({ error: 'victimIds is required' }, { status: 400 })
    }
    if (victimIds.some((victimId: string) => victimId === survivorId)) {
      return NextResponse.json({ error: 'Cannot merge a merchant into itself' }, { status: 400 })
    }

    const db = createServiceSupabaseClient()
    const merchantIds = [survivorId, ...victimIds]
    const { data: merchants, error: merchantError } = await db
      .from('merchants')
      .select('id, household_id')
      .in('id', merchantIds)
      .eq('household_id', ctx.householdId)

    if (merchantError) {
      if (isMerchantSchemaNotReadyError(merchantError)) {
        return NextResponse.json(merchantSchemaNotReadyResponse('merchants'), { status: 503 })
      }
      return NextResponse.json({ error: merchantError.message }, { status: 500 })
    }

    if ((merchants ?? []).length !== merchantIds.length) {
      return NextResponse.json({ error: 'One or more merchants were not found' }, { status: 404 })
    }

    if (body?.preview === true) {
      const previews = await Promise.all(victimIds.map((victimId: string) => previewMerchantMerge(victimId, survivorId)))
      const aggregate = previews.reduce(
        (totals, preview) => {
          totals.aliases += preview.impact.aliases
          totals.statementTransactions += preview.impact.statementTransactions
          totals.receipts += preview.impact.receipts
          totals.ledgerEntries += preview.impact.ledgerEntries
          totals.receiptKnowledge += preview.impact.receiptKnowledge
          totals.categorizationAudits += preview.impact.categorizationAudits
          totals.groceryPurchases += preview.impact.groceryPurchases
          totals.total += preview.impact.total
          return totals
        },
        {
          aliases: 0,
          statementTransactions: 0,
          receipts: 0,
          ledgerEntries: 0,
          receiptKnowledge: 0,
          categorizationAudits: 0,
          groceryPurchases: 0,
          total: 0,
        },
      )

      return NextResponse.json({ preview: { survivorId, victimIds, impact: aggregate } })
    }

    const results = []
    for (const victimId of victimIds) {
      results.push(await mergeMerchant(victimId, survivorId, ctx.userId))
    }

    return NextResponse.json({ success: true, survivorId, victimIds, results })
  } catch (error) {
    const { status, body } = merchantApiErrorPayload(error, 'Failed to merge merchants', 'merge_merchant_safe')
    return NextResponse.json(body, { status })
  }
}
