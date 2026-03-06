import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { filterNewParsedTransactions } from '@/lib/integrity/reconciler'
import type { Database } from '@/types/database'

function serviceClient() {
  return createService<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { import_id, skip_duplicates_ids } = await request.json()

    if (!import_id) {
      return NextResponse.json({ error: 'import_id is required' }, { status: 400 })
    }

    // Fetch the import record
    const { data: importRecord, error: fetchError } = await supabase
      .from('statement_imports')
      .select('*')
      .eq('id', import_id)
      .single()

    if (fetchError || !importRecord) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 })
    }

    const parsedData = (importRecord as any).parsed_data || { transactions: [] }
    const transactions = parsedData.transactions || []

    if (transactions.length === 0) {
      // No transactions to approve
      await supabase
        .from('statement_imports')
        .update({ parse_status: 'confirmed' })
        .eq('id', import_id)

      return NextResponse.json({ 
        approved: 0, 
        duplicates: 0, 
        total: 0 
      })
    }

    // Run reconciliation to find duplicates
    const reconciliation = await filterNewParsedTransactions(
      supabase,
      importRecord.account_id,
      transactions
    )

    // Filter out manually skipped duplicates
    const skipSet = new Set(skip_duplicates_ids || [])
    const txnsToInsert = reconciliation.new_transactions.filter(
      (_, idx) => !skipSet.has(`new_${idx}`)
    )

    // Insert new transactions into statement_transactions
    let insertedCount = 0
    if (txnsToInsert.length > 0) {
      const toInsert = txnsToInsert.map((t: any) => ({
        statement_import_id: import_id,
        account_id: importRecord.account_id,
        txn_date: t.date || null,
        amount: t.amount || 0,
        description: t.description || null,
        txn_type: t.type || 'debit',
        merchant_raw: null,
        category_id: null,
        confidence: parsedData.institution_code ? 0.5 : 1,
      }))

      const { data: inserted, error: insertError } = await supabase
        .from('statement_transactions')
        .insert(toInsert)
        .select()

      if (insertError) {
        console.error('Transaction insert error:', insertError)
        return NextResponse.json({ error: 'Failed to insert transactions' }, { status: 500 })
      }

      insertedCount = inserted?.length || 0
    }

    // Mark import as confirmed
    await supabase
      .from('statement_imports')
      .update({ 
        parse_status: 'confirmed',
        parse_confidence: insertedCount > 0 ? importRecord.parse_confidence : 0,
      })
      .eq('id', import_id)

    return NextResponse.json({
      approved: insertedCount,
      duplicates_found: reconciliation.duplicate_count,
      total_parsed: transactions.length,
      message: `Approved ${insertedCount} new transactions (${reconciliation.duplicate_count} duplicates skipped)`,
    })
  } catch (error) {
    console.error('Statement approval error:', error)
    return NextResponse.json({ error: 'Failed to approve statement' }, { status: 500 })
  }
}
