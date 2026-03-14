"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArrowLeftRight,
  Bot,
  Coins,
  FolderTree,
  HandCoins,
  Home,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Shield,
  Store,
  Tag,
  TrendingUp,
  User,
  Wallet,
  ChevronsUpDown,
  FileUp,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface AppSidebarProps {
  user: { id: string; email?: string }
  profile: {
    display_name: string | null
    avatar_url: string | null
    role: string
    household_id: string
    households: { name: string; base_currency: string } | null
  } | null
}

const navigationGroups = [
  {
    label: "Overview",
    items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Money",
    items: [
      { title: "Accounts", href: "/accounts", icon: Wallet },
      { title: "Transactions", href: "/transactions", icon: ArrowLeftRight },
      { title: "Advances", href: "/advances", icon: HandCoins },
    ],
  },
  {
    label: "Import",
    items: [
      { title: "Statements", href: "/statements", icon: FileUp },
      { title: "Receipts", href: "/receipts", icon: Receipt },
    ],
  },
  {
    label: "Assets",
    items: [
      { title: "Investments", href: "/investments", icon: TrendingUp },
      { title: "Crypto", href: "/crypto", icon: Coins },
    ],
  },
  {
    label: "Manage",
    items: [
      { title: "Categories", href: "/categories", icon: FolderTree },
      { title: "Tags", href: "/tags", icon: Tag },
      { title: "Merchants", href: "/merchants", icon: Store },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Data Health", href: "/data-health", icon: Shield },
      { title: "Settings", href: "/settings", icon: Settings },
    ],
  },
] as const

export function AppSidebar({ user, profile }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const displayName = profile?.display_name || user.email || "User"
  const householdName = profile?.households?.name || "Personal Finance"
  const initials = profile?.display_name
    ? profile.display_name
        .split(" ")
        .map((name) => name[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user.email?.[0]?.toUpperCase() ?? "U")

  const isItemActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Home className="size-4.5" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-bold tracking-tight">WealthHouse</span>
                  <span className="truncate text-xs text-muted-foreground">{householdName}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navigationGroups.map((group, index) => (
          <div key={group.label}>
            {index > 0 ? <SidebarSeparator /> : null}
            <SidebarGroup>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isItemActive(item.href)}
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="AI Chat">
              <Link href="/chat">
                <Bot />
                <span>AI Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator />

        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="size-8">
                    {profile?.avatar_url ? (
                      <AvatarImage src={profile.avatar_url} alt={displayName} />
                    ) : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem asChild>
                  <Link href="/settings/profile">
                    <User />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
