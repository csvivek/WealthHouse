import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Quick CSV parser helper used for simple straight‑through statements
function parseCsvTransactions(text: string, accountId: string, importId: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const dateIdx = headers.findIndex(h => /date/.test(h))
  const descIdx = headers.findIndex(h => /(desc|merchant|narration)/.test(h))
  const amtIdx = headers.findIndex(h => /(amount|txn_amount)/.test(h))

  return lines.slice(1).map(line => {
    const cols = line.split(',')
    const rawAmt = cols[amtIdx] || ''
    const amount = parseFloat(rawAmt.replace(/[^0-9.-]/g, '')) || 0
    const txnType = amount < 0 ? 'debit' : 'credit'
    return {
      account_id: accountId,
      txn_date: cols[dateIdx] || null,
      description: cols[descIdx] || null,
      amount: amount,
      txn_type: txnType,
      merchant_raw: null,
      category_id: null,
      confidence: 1,
      statement_import_id: importId,
    }
  })
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('statement') as File | null
    const accountId = formData.get('account_id') as string | null
    const institutionId = formData.get('institution_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Statement file is required' }, { status: 400 })
    }
    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
    }

    // Check if this file has already been processed for this account
    const { data: existingImport, error: checkError } = await supabase
      .from('statement_imports')
      .select('id, created_at')
      .eq('account_id', accountId)
      .eq('statement_name', file.name)
      .limit(1)

    if (checkError) {
      console.error('Duplicate filename check error:', checkError)
    }

    if (existingImport && existingImport.length > 0) {
      return NextResponse.json({ 
        error: `This file has already been processed. File: "${file.name}" was imported on ${new Date(existingImport[0].created_at).toLocaleDateString()}. Please check your import history or use a different file.`,
        code: 'DUPLICATE_FILENAME',
        previous_import_id: existingImport[0].id,
      }, { status: 409 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = Buffer.from(arrayBuffer)

    // optional duplicate detection using hash of bytes
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')

    const fileName = `${user.id}/${Date.now()}_${file.name}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('statements')
      .upload(fileName, bytes, { contentType: file.type || 'application/octet-stream' })

    if (uploadError) {
      console.error('Statement storage error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    const fileUrl = uploadData?.path || null

    // create import record
    const insertObj: any = {
      account_id: accountId,
      institution_id: institutionId,
      statement_name: file.name,
      file_url: fileUrl,
      parse_status: 'pending',
      parse_confidence: 0,
    }
    const { data: importRow, error: importError } = await supabase
      .from('statement_imports')
      .insert(insertObj)
      .select()
      .single()

    if (importError || !importRow) {
      console.error('Statement import insert error:', importError)
      return NextResponse.json({ error: 'Failed to create import record' }, { status: 500 })
    }

    // If CSV, store transactions in parsed_data for later approval
    let parsedData: any = { transactions: [] }
    if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
      const text = bytes.toString('utf-8')
      const csvTxns = parseCsvTransactions(text, accountId, importRow.id)
      parsedData.transactions = csvTxns.map(t => ({
        date: t.txn_date,
        description: t.description,
        amount: t.amount,
        type: t.txn_type,
      }))
    } else {
      // non‑CSV uploads will use the local AI parser directly
      try {
        const { parseStatement } = await import('@/lib/ai/statement-parser')
        const base64 = bytes.toString('base64')
        const parsed = await parseStatement(base64, file.type || 'application/pdf')
        parsedData = {
          institution_code: parsed.institution_code,
          period_start: parsed.period_start,
          period_end: parsed.period_end,
          summary: parsed.summary,
          transactions: (parsed.transactions || []).map((t: any) => ({
            date: t.date,
            description: t.description,
            amount: t.amount,
            type: t.amount < 0 ? 'debit' : 'credit',
          })),
        }
      } catch (err) {
        console.error('AI parse failed', err)
        // Still mark as completed but with low confidence
        parsedData = { transactions: [] }
      }
    }

    // Update import record with parsed data (don't insert transactions yet)
    const { error: updateError } = await supabase
      .from('statement_imports')
      .update({ 
        parse_status: 'completed', 
        parse_confidence: parsedData.transactions.length > 0 ? (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv') ? 1 : 0.5) : 0,
        parsed_data: parsedData,
      })
      .eq('id', importRow.id)

    if (updateError) {
      console.error('Failed to update import with parsed data:', updateError)
    }

    return NextResponse.json({ 
      import: importRow, 
      parsed_transaction_count: parsedData.transactions.length 
    })
  } catch (error) {
    console.error('Statement upload error:', error)
    return NextResponse.json({ error: 'Failed to upload statement' }, { status: 500 })
  }
}
