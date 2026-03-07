import { redirect } from "next/navigation"
import { createServerSupabaseClient } from "@/lib/supabase/server"
import { ensureProfile } from "@/lib/supabase/ensure-profile"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

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
    .from("user_profiles")
    .select("*, households(name, base_currency)")
    .eq("id", user.id)
    .single()

  return (
    <SidebarProvider>
      <AppSidebar user={user} profile={profile} />
      <SidebarInset>
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
