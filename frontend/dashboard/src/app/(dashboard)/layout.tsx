import { redirect } from 'next/navigation'
import { ExecutiveAppShell } from '@/components/executive/app-shell'
import { isReceiptSchemaNotReadyError } from '@/lib/receipts/config'
import { ensureProfile } from '@/lib/supabase/ensure-profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  await ensureProfile(supabase, user.id)

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*, households(name, base_currency)')
    .eq('id', user.id)
    .single()

  let digestBadgeCount = 0
  if (profile?.household_id) {
    const { data, error } = await supabase
      .from('receipt_uploads')
      .select('id, status')
      .eq('household_id', profile.household_id)
      .in('status', ['needs_review', 'ready_for_approval'])

    if (!error) {
      digestBadgeCount = data?.length ?? 0
    } else if (!isReceiptSchemaNotReadyError(error, 'receipt_uploads')) {
      console.error('Failed to load receipt upload digest badge count', error)
    }
  }

  return (
    <ExecutiveAppShell
      user={user}
      profile={profile}
      digestBadgeCount={digestBadgeCount}
    >
      {children}
    </ExecutiveAppShell>
  )
}
