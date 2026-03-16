import { Building2 } from 'lucide-react'
import { ExecutiveEmptyState, ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Card, CardContent } from '@/components/ui/card'

export default function PropertiesPage() {
  return (
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="Net Worth Workspace"
        title="Properties"
        description="Real-estate tracking remains reserved in the wealth workspace even though the feature surface is still pending."
      />
      <Card>
        <CardContent>
          <ExecutiveEmptyState
            icon={Building2}
            title="Property tracking is planned next"
            description="This route stays visible in the redesign so the future wealth workspace structure does not lose a placeholder feature."
          />
        </CardContent>
      </Card>
    </ExecutivePage>
  )
}
