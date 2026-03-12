import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceSupabaseClient } from '@/lib/supabase/service'
import type { Database } from '@/types/database'
import { refreshLinkSuggestionsForImport } from '@/lib/statement-linking'
import {
  isApprovedMappingStatus,
  rewriteApprovedMappingStatus,
  withApprovedMappingStatusFallback,
} from '@/lib/statement-linking/config'

type StagingLinkInsert = Database['public']['Tables']['staging_transaction_links']['Insert']
type StagingLinkUpdate = Database['public']['Tables']['staging_transaction_links']['Update']
type ApprovalLogInsert = Database['public']['Tables']['approval_log']['Insert']

function readErrorMessage(error: unknown, fallback = 'Failed to update links') {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) {
    return String((error as { message?: unknown }).message ?? fallback)
  }
  return fallback
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await params
    const supabase = await createServerSupabaseClient()
    const serviceSupabase = createServiceSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const body = await request.json()
    const action = String(body.action || '')

    if (action === 'refresh') {
      await refreshLinkSuggestionsForImport({
        supabase: serviceSupabase,
        fileImportId: importId,
        householdId: profile.household_id,
        actorUserId: user.id,
      })

      return NextResponse.json({ ok: true })
    }

    if (action === 'approve' || action === 'reject') {
      const linkIds = Array.isArray(body.linkIds) ? body.linkIds.filter((id: unknown): id is string => typeof id === 'string') : []
      if (linkIds.length === 0) {
        return NextResponse.json({ error: 'No link IDs provided' }, { status: 400 })
      }

      const runUpdate = (approvedStatus: 'confirmed' | 'approved') => {
        const update: StagingLinkUpdate = {
          status: (action === 'approve' ? approvedStatus : 'rejected') as Database['public']['Enums']['mapping_status'],
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        return supabase
          .from('staging_transaction_links')
          .update(update)
          .eq('file_import_id', importId)
          .eq('household_id', profile.household_id)
          .in('id', linkIds)
      }

      const { error } = action === 'approve'
        ? await withApprovedMappingStatusFallback(runUpdate)
        : await runUpdate('confirmed')

      if (error) {
        return NextResponse.json({ error: readErrorMessage(error) }, { status: 500 })
      }

      const approvalLog: ApprovalLogInsert = {
        household_id: profile.household_id,
        file_import_id: importId,
        actor_user_id: user.id,
        action: 'edit',
        new_data: { kind: 'staging_transaction_link', action, linkIds },
      }
      await supabase.from('approval_log').insert(approvalLog)

      return NextResponse.json({ ok: true, updatedCount: linkIds.length })
    }

    if (action === 'manual_upsert') {
      const payload = body.link as Partial<StagingLinkInsert> | undefined
      if (!payload || !payload.from_staging_id || !payload.link_type) {
        return NextResponse.json({ error: 'Invalid link payload' }, { status: 400 })
      }

      const requestedStatus = payload.status ?? 'confirmed'
      let insert: StagingLinkInsert = {
        file_import_id: importId,
        household_id: profile.household_id,
        from_staging_id: payload.from_staging_id,
        to_staging_id: payload.to_staging_id ?? null,
        to_transaction_id: payload.to_transaction_id ?? null,
        link_type: payload.link_type,
        link_score: payload.link_score ?? 1,
        link_reason: payload.link_reason ?? { manual: true },
        status: requestedStatus,
        matched_by: 'user',
        matched_by_user_id: user.id,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }

      const runInsert = (approvedStatus: 'confirmed' | 'approved') => {
        insert = {
          ...insert,
          status: (rewriteApprovedMappingStatus(requestedStatus, approvedStatus) ?? 'needs_review') as Database['public']['Enums']['mapping_status'],
        }
        return supabase.from('staging_transaction_links').insert(insert)
      }

      const { error } = isApprovedMappingStatus(requestedStatus)
        ? await withApprovedMappingStatusFallback(runInsert)
        : await runInsert('confirmed')

      if (error) {
        return NextResponse.json({ error: readErrorMessage(error) }, { status: 500 })
      }

      const approvalLog: ApprovalLogInsert = {
        household_id: profile.household_id,
        file_import_id: importId,
        actor_user_id: user.id,
        action: 'edit',
        new_data: { kind: 'staging_transaction_link', action, link: insert },
      }
      await supabase.from('approval_log').insert(approvalLog)

      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const linkId = typeof body.linkId === 'string' ? body.linkId : null
      if (!linkId) {
        return NextResponse.json({ error: 'Missing linkId' }, { status: 400 })
      }

      const { error } = await supabase
        .from('staging_transaction_links')
        .delete()
        .eq('id', linkId)
        .eq('file_import_id', importId)
        .eq('household_id', profile.household_id)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const approvalLog: ApprovalLogInsert = {
        household_id: profile.household_id,
        file_import_id: importId,
        actor_user_id: user.id,
        action: 'edit',
        new_data: { kind: 'staging_transaction_link', action, linkId },
      }
      await supabase.from('approval_log').insert(approvalLog)

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update links' }, { status: 500 })
  }
}
