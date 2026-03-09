import { NextRequest, NextResponse } from 'next/server'
import { categorizeTransaction, addToKnowledge } from '@/lib/ai/categorizer'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { merchantName, amount, description } = await request.json()

    if (!merchantName) {
      return NextResponse.json({ error: 'merchantName is required' }, { status: 400 })
    }

    // Fetch available categories
    const { data: categories } = await supabase.from('categories').select('id, name, icon_key, color_token, color_hex')

    const result = await categorizeTransaction(
      merchantName,
      amount || 0,
      description,
      categories || undefined
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Categorize API error:', error)
    return NextResponse.json(
      { error: 'Failed to categorize transaction' },
      { status: 500 }
    )
  }
}

// Endpoint to confirm/correct a categorization
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { merchantName, category } = await request.json()

    if (!merchantName || !category) {
      return NextResponse.json({ error: 'merchantName and category are required' }, { status: 400 })
    }

    // Add to knowledge base so it won't ask again
    addToKnowledge(merchantName, category)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Knowledge update error:', error)
    return NextResponse.json(
      { error: 'Failed to update knowledge' },
      { status: 500 }
    )
  }
}
