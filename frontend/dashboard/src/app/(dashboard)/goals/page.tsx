import { Target } from 'lucide-react'
import { ExecutiveEmptyState, ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Card, CardContent } from '@/components/ui/card'

export default function GoalsPage() {
  return (
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="Net Worth Workspace"
        title="Financial Goals"
        description="Goals remain discoverable in the new shell even before the dedicated planning screens are built."
      />
      <Card>
        <CardContent>
          <ExecutiveEmptyState
            icon={Target}
            title="Goal tracking is coming soon"
            description="The placeholder stays in the executive navigation so the route remains part of the end-state information architecture."
          />
        </CardContent>
      </Card>
    </ExecutivePage>
  )
}
