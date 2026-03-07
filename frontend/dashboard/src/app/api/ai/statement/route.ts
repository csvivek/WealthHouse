import * as crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/ai/statement-parser'
import { normalizeDirection } from '@/lib/statements/helpers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ensureProfile } from '@/lib/supabase/ensure-profile'

function computeFileHash(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function computeTxnHash(
  accountId: string,
  txnDate: string,
  postingDate: string | undefined,
  amount: number,
  currency: string,
  merchantRaw: string,
  reference: string | undefined,
): string {
  const input = [
    accountId,
    txnDate,
    postingDate ?? '',
    String(amount),
    currency,
    merchantRaw.trim().toLowerCase(),
    reference ?? '',
  ].join('|')

  return crypto.createHash('sha256').update(input).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensureProfile(supabase, user.id)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('household_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'No profile found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('statement') as File | null
    const accountId = formData.get('account_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'Statement file is required' }, { status: 400 })
    }

    if (!accountId) {
      return NextResponse.json({ error: 'Account selection is required' }, { status: 400 })
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('id, institution_id')
      .eq('id', accountId)
      .eq('household_id', profile.household_id)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Account not found or not in household' }, { status: 404 })
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const fileSha256 = computeFileHash(bytes)

    const { data: existingImport } = await supabase
      .from('file_imports')
      .select('id, status, file_name')
      .eq('household_id', profile.household_id)
      .eq('file_sha256', fileSha256)
      .not('status', 'eq', 'failed')
      .limit(1)
      .maybeSingle()

    if (existingImport) {
      return NextResponse.json(
        {
          error: 'This file has already been processed.',
          existingImportId: existingImport.id,
          existingFileName: existingImport.file_name,
          existingStatus: existingImport.status,
        },
        { status: 409 },
      )
    }

    const { data: fileImport, error: fileImportError } = await supabase
      .from('file_imports')
      .insert({
        household_id: profile.household_id,
        account_id: accountId,
        uploaded_by: user.id,
        file_name: file.name,
        file_sha256: fileSha256,
        mime_type: file.type || 'application/octet-stream',
        file_size_bytes: bytes.byteLength,
        status: 'parsing',
        institution_id: account.institution_id,
      })
      .select('id')
      .single()

    if (fileImportError || !fileImport) {
      return NextResponse.json({ error: 'Failed to register file import' }, { status: 500 })
    }

    let parsed
    try {
      parsed = await parseStatement(bytes, file.type || 'application/pdf', file.name)
    } catch (parseError) {
      await supabase
        .from('file_imports')
        .update({
          status: 'failed',
          parse_error: parseError instanceof Error ? parseError.message : 'Parse failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileImport.id)

      return NextResponse.json(
        { error: parseError instanceof Error ? parseError.message : 'Failed to parse statement' },
        { status: 500 },
      )
    }

    const parsedTransactions = (parsed.transactions || [])
      .map((transaction) => {
        const txnDate = transaction.date || transaction.posting_date || null
        const amount = Math.abs(transaction.amount || 0)

        if (!txnDate || !amount) {
          return null
        }

        return {
          txn_date: txnDate,
          posting_date: transaction.posting_date || undefined,
          merchant_raw: transaction.merchant || transaction.description || 'Imported transaction',
          amount,
          txn_type: normalizeDirection(transaction),
          description: transaction.description || null,
          reference: transaction.reference || undefined,
          currency: transaction.currency || parsed.currency || 'SGD',
          original_amount:
            transaction.currency && transaction.currency !== (parsed.currency || 'SGD') ? amount : null,
          original_currency:
            transaction.currency && transaction.currency !== (parsed.currency || 'SGD') ? transaction.currency : null,
        }
      })
      .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction))

    const existingHashes = new Set<string>()
    if (parsedTransactions.length > 0) {
      const hashes = parsedTransactions.map((transaction) =>
        computeTxnHash(
          accountId,
          transaction.txn_date,
          transaction.posting_date,
          transaction.amount,
          transaction.currency,
          transaction.merchant_raw,
          transaction.reference,
        ),
      )

      const { data: existing } = await supabase
        .from('statement_transactions')
        .select('txn_hash')
        .eq('account_id', accountId)
        .in('txn_hash', hashes)

      if (existing) {
        for (const row of existing) {
          if (row.txn_hash) {
            existingHashes.add(row.txn_hash)
          }
        }
      }
    }

    const withinImportCounts = new Map<string, number>()
    const txnHashes = parsedTransactions.map((transaction) =>
      computeTxnHash(
        accountId,
        transaction.txn_date,
        transaction.posting_date,
        transaction.amount,
        transaction.currency,
        transaction.merchant_raw,
        transaction.reference,
      ),
    )

    for (const hash of txnHashes) {
      withinImportCounts.set(hash, (withinImportCounts.get(hash) || 0) + 1)
    }

    let duplicateCount = 0
    const stagingRows = parsedTransactions.map((transaction, index) => {
      const txnHash = txnHashes[index]
      let duplicateStatus: 'none' | 'existing_final' | 'within_import' = 'none'

      if (existingHashes.has(txnHash)) {
        duplicateStatus = 'existing_final'
        duplicateCount += 1
      } else if ((withinImportCounts.get(txnHash) || 0) > 1) {
        duplicateStatus = 'within_import'
        duplicateCount += 1
      }

      return {
        file_import_id: fileImport.id,
        household_id: profile.household_id,
        account_id: accountId,
        row_index: index,
        review_status: 'pending' as const,
        duplicate_status: duplicateStatus,
        txn_hash: txnHash,
        source_txn_hash: txnHash,
        txn_date: transaction.txn_date,
        posting_date: transaction.posting_date || null,
        merchant_raw: transaction.merchant_raw,
        description: transaction.description,
        reference: transaction.reference || null,
        amount: transaction.amount,
        txn_type: transaction.txn_type,
        currency: transaction.currency,
        original_amount: transaction.original_amount,
        original_currency: transaction.original_currency,
        confidence: parsedTransactions.length > 0 ? 0.85 : 0,
        original_data: transaction,
        is_edited: false,
      }
    })

    if (stagingRows.length > 0) {
      const { error: stagingError } = await supabase
        .from('import_staging')
        .insert(stagingRows)

      if (stagingError) {
        await supabase
          .from('file_imports')
          .update({
            status: 'failed',
            parse_error: 'Failed to stage transactions',
            updated_at: new Date().toISOString(),
          })
          .eq('id', fileImport.id)

        return NextResponse.json({ error: 'Failed to stage parsed transactions' }, { status: 500 })
      }
    }

    await supabase
      .from('file_imports')
      .update({
        status: 'in_review',
        institution_code: parsed.institution_code || null,
        statement_date: parsed.statement_date || null,
        statement_period_start: parsed.period_start || null,
        statement_period_end: parsed.period_end || null,
        currency: parsed.currency || 'SGD',
        parse_confidence: parsedTransactions.length > 0 ? 0.85 : 0,
        raw_parse_result: parsed as unknown as Record<string, unknown>,
        summary_json: (parsed.summary_json || { summary: parsed.summary || null }) as Record<string, unknown>,
        card_info_json: (parsed.account || null) as Record<string, unknown> | null,
        total_rows: parsedTransactions.length,
        duplicate_rows: duplicateCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', fileImport.id)

    return NextResponse.json({
      importId: fileImport.id,
      status: 'in_review',
      institutionCode: parsed.institution_code ?? null,
      transactionsCount: parsedTransactions.length,
      duplicateCount,
      statementDate: parsed.statement_date ?? null,
      period: { start: parsed.period_start ?? null, end: parsed.period_end ?? null },
      reviewUrl: `/statements/review/${fileImport.id}`,
    })
  } catch (error) {
    console.error('Statement parse error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse statement' },
      { status: 500 },
    )
  }
}
