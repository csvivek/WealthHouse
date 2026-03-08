'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { StatementCommitJobsProvider } from '@/lib/statement-commit-jobs'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <StatementCommitJobsProvider>
          {children}
          <Toaster richColors position="top-right" />
        </StatementCommitJobsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
