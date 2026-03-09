import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [groupsResult, subgroupsResult, categoriesResult, hierarchyResult, groupTotalsResult, subgroupTotalsResult, groupCountsResult, subgroupCountsResult] =
      await Promise.all([
        supabase.from('category_groups').select('id, name, domain, subtype, sort_order').order('sort_order').order('name'),
        supabase.from('category_subgroups').select('id, group_id, name, domain, subtype, sort_order').order('sort_order').order('name'),
        supabase.from('categories').select('id, name, type, group_id, subgroup_id').order('name'),
        supabase.from('v_category_taxonomy_hierarchy').select('*'),
        supabase.from('v_category_group_transaction_totals').select('*').order('group_name'),
        supabase.from('v_category_subgroup_transaction_totals').select('*').order('group_name').order('subgroup_name'),
        supabase.from('v_category_group_child_counts').select('*').order('group_name'),
        supabase.from('v_category_subgroup_child_counts').select('*').order('subgroup_name'),
      ])

    const firstError =
      groupsResult.error ||
      subgroupsResult.error ||
      categoriesResult.error ||
      hierarchyResult.error ||
      groupTotalsResult.error ||
      subgroupTotalsResult.error ||
      groupCountsResult.error ||
      subgroupCountsResult.error

    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 })
    }

    return NextResponse.json({
      groups: groupsResult.data ?? [],
      subgroups: subgroupsResult.data ?? [],
      categories: categoriesResult.data ?? [],
      hierarchy: hierarchyResult.data ?? [],
      rollups: {
        groupTotals: groupTotalsResult.data ?? [],
        subgroupTotals: subgroupTotalsResult.data ?? [],
        groupCounts: groupCountsResult.data ?? [],
        subgroupCounts: subgroupCountsResult.data ?? [],
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch category taxonomy' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await request.json()) as {
      entityType?: 'group' | 'subgroup'
      name?: string
      groupId?: number
      domain?: string | null
      subtype?: string | null
    }

    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    if (body.entityType === 'subgroup') {
      if (!body.groupId) return NextResponse.json({ error: 'groupId is required for subgroups' }, { status: 400 })

      const { data, error } = await supabase
        .from('category_subgroups')
        .insert({
          group_id: body.groupId,
          name,
          domain: body.domain?.trim() || null,
          subtype: body.subtype?.trim() || null,
        })
        .select('id, group_id, name, domain, subtype, sort_order')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ subgroup: data })
    }

    const { data, error } = await supabase
      .from('category_groups')
      .insert({
        name,
        domain: body.domain?.trim() || null,
        subtype: body.subtype?.trim() || null,
      })
      .select('id, name, domain, subtype, sort_order')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ group: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create taxonomy entity' },
      { status: 500 },
    )
  }
}
