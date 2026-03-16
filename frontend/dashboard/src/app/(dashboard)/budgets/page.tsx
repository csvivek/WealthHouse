import { PieChart } from 'lucide-react'
import { ExecutiveEmptyState, ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Card, CardContent } from '@/components/ui/card'

export default function BudgetsPage() {
  return (
    <ExecutivePage>
      <ExecutivePageHeader
        eyebrow="Net Worth Workspace"
        title="Budgets"
        description="Budget planning will live inside the broader net worth workspace once this module is ready."
      />
      <Card>
        <CardContent>
          <ExecutiveEmptyState
            icon={PieChart}
            title="Budget tracking is planned next"
            description="The feature placeholder remains available in the new shell so the route stays discoverable without inventing backend behavior."
          />
        </CardContent>
      </Card>
    </ExecutivePage>
  )
}
