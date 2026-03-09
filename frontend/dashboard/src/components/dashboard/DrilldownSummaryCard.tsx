import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface DrilldownSummaryCardProps {
  label: string
  value: string
}

export function DrilldownSummaryCard({ label, value }: DrilldownSummaryCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  )
}
