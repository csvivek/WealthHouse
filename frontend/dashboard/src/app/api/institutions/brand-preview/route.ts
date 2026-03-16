import { NextRequest, NextResponse } from 'next/server'
import { resolveInstitutionBrandPreview } from '@/lib/server/institution-branding'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const institutionName = searchParams.get('name')
  const institutionCode = searchParams.get('code')

  if (!institutionName?.trim() && !institutionCode?.trim()) {
    return NextResponse.json({ matched: false })
  }

  try {
    const preview = await resolveInstitutionBrandPreview({
      institutionName,
      institutionCode,
    })

    return NextResponse.json(preview ?? { matched: false })
  } catch (error) {
    console.error('Institution brand preview error:', error)
    return NextResponse.json({ matched: false })
  }
}
