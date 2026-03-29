'use client'

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { StatementCommitJobsProvider } from '@/lib/statement-commit-jobs'
import { StatementIngestionJobsProvider } from '@/lib/statement-ingestion-jobs'
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
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StatementIngestionJobsProvider>
            <StatementCommitJobsProvider>
              {children}
              <Toaster richColors position="top-right" />
            </StatementCommitJobsProvider>
          </StatementIngestionJobsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
