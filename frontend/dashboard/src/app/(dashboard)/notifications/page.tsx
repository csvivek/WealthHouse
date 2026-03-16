import { Bell } from 'lucide-react'
import { ExecutiveEmptyState, ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Card, CardContent } from '@/components/ui/card'

export default function NotificationsPage() {
  return (
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="Digest Workspace"
        title="Notifications"
        description="The digest area now has a dedicated placeholder surface for future alerts and approvals without removing the route."
      />
      <Card>
        <CardContent>
          <ExecutiveEmptyState
            icon={Bell}
            title="Notifications are planned for a future release"
            description="This system route remains visible in the new design so future alerting can plug into the same shell."
          />
        </CardContent>
      </Card>
    </ExecutivePage>
  )
}
