import { FileText } from 'lucide-react'
import { ExecutiveEmptyState, ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Card, CardContent } from '@/components/ui/card'

export default function DocumentsPage() {
  return (
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="System Workspace"
        title="Documents"
        description="Document storage keeps its route presence in the executive shell while the underlying feature remains in a coming-soon state."
      />
      <Card>
        <CardContent>
          <ExecutiveEmptyState
            icon={FileText}
            title="Document storage is coming soon"
            description="The route remains styled and reachable so the redesign does not hide unfinished but intentional system surfaces."
          />
        </CardContent>
      </Card>
    </ExecutivePage>
  )
}
