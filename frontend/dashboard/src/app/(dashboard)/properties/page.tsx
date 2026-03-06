import { Building2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export default function PropertiesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="mb-4 size-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Coming Soon</h2>
          <p className="text-sm text-muted-foreground">
            Real estate tracking is planned for a future release.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
