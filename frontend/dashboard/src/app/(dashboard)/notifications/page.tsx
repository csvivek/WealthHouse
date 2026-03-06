import { Bell } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Bell className="mb-4 size-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Coming Soon</h2>
          <p className="text-sm text-muted-foreground">
            Notifications are planned for a future release.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
