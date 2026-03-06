import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/ai/statement-parser'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('statement') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Statement file is required' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type || 'application/pdf'

    const parsed = await parseStatement(base64, mimeType)
    const txns = parsed.transactions || []

    return NextResponse.json({
      institution_code: parsed.institution_code ?? null,
      transactions_count: txns.length,
      statement_date: parsed.statement_date ?? null,
      period: { start: parsed.period_start ?? null, end: parsed.period_end ?? null },
      summary: parsed.summary ?? null,
      transactions: txns,
    })
  } catch (error) {
    console.error('Statement parse error:', error)
    return NextResponse.json({ error: 'Failed to parse statement' }, { status: 500 })
  }
}
