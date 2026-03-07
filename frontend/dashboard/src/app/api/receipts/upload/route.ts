import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { parseReceipt } from '@/lib/ai/receipt-parser'
import type { Database } from '@/types/database'
import crypto from 'crypto'

type ParsedReceipt = Awaited<ReturnType<typeof parseReceipt>>
type ParsedReceiptItem = ParsedReceipt['items'][number]
type ReceiptInsert = Database['public']['Tables']['receipts']['Insert']
type ReceiptItemInsert = Database['public']['Tables']['receipt_items']['Insert']

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('receipt') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Receipt image is required' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = Buffer.from(arrayBuffer)

    // compute SHA-256 hash for duplicate detection
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')

    // check for existing receipt with same hash
    const { data: existing } = await supabase
      .from('receipts')
      .select('id')
      .eq('receipt_hash', hash)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'duplicate', receiptId: existing.id }, { status: 409 })
    }

    // upload file to storage
    const fileName = `${user.id}/${Date.now()}_${file.name}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(fileName, bytes, { contentType: file.type })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    const fileUrl = uploadData?.path || null

    // parse receipt using existing AI helper
    let parsed: ParsedReceipt | null = null
    try {
      const base64 = bytes.toString('base64')
      parsed = await parseReceipt(base64, file.type || 'image/jpeg')
    } catch (err) {
      console.error('Receipt parse failed, continuing without parsed data', err)
    }

    // insert into receipts table
    const insertObj: ReceiptInsert = {
      merchant_raw: parsed?.merchantName || file.name,
      total_amount: parsed?.totalAmount || 0,
      currency: parsed?.currency || 'SGD',
      receipt_datetime: parsed?.date || null,
      source: 'upload',
      extraction_confidence: parsed ? 1 : 0,
      receipt_hash: hash,
      file_url: fileUrl,
      status: 'pending_confirm',
    }

    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert(insertObj)
      .select()
      .single()

    if (insertError) {
      console.error('Receipt insert error:', insertError)
      return NextResponse.json({ error: 'Failed to save receipt' }, { status: 500 })
    }

    // insert items if available
    if (parsed?.items && Array.isArray(parsed.items) && parsed.items.length) {
      const itemsToInsert: ReceiptItemInsert[] = parsed.items.map((item: ParsedReceiptItem) => ({
        receipt_id: receipt.id,
        item_name_raw: item.name,
        quantity: item.quantity,
        unit_price: item.price,
        line_total: item.quantity * item.price,
      }))
      await supabase.from('receipt_items').insert(itemsToInsert)
    }

    return NextResponse.json({ receipt, parsed })
  } catch (error) {
    console.error('Receipt upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload receipt' },
      { status: 500 }
    )
  }
}
