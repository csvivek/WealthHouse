'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCurrency, formatCurrencyCompact } from '@/lib/format'
import type { BreakdownTabDto } from '@/lib/dashboard-mappers'
import { BreakdownTable } from '@/components/dashboard/BreakdownTable'

interface BreakdownChartCardProps {
  payments: BreakdownTabDto
  receipts: BreakdownTabDto
  currency?: string
}

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`
}

function BreakdownChartPanel({
  data,
  currency,
}: {
  data: BreakdownTabDto
  currency: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartData = useMemo(() => data.rows.slice(0, 6), [data.rows])

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const draw = () => {
      const size = Math.min(containerRef.current?.clientWidth ?? 240, 240)
      const radius = size / 2
      const svg = d3.select(svgRef.current).attr('width', size).attr('height', size)
      svg.selectAll('*').remove()

      if (chartData.length === 0) {
        svg
          .append('text')
          .attr('x', size / 2)
          .attr('y', size / 2)
          .attr('text-anchor', 'middle')
          .attr('fill', 'currentColor')
          .style('font-size', '14px')
          .text('No data yet')
        return
      }

      const g = svg.append('g').attr('transform', `translate(${radius},${radius})`)
      const style = getComputedStyle(document.documentElement)
      const palette = [1, 2, 3, 4, 5, 6].map((index) => {
        const value = style.getPropertyValue(`--chart-${index}`).trim()
        return value ? `oklch(${value})` : undefined
      })

      const pie = d3
        .pie<(typeof chartData)[0]>()
        .value((d) => d.totalValue)
        .sort(null)
        .padAngle(0.02)

      const arc = d3
        .arc<d3.PieArcDatum<(typeof chartData)[0]>>()
        .innerRadius(radius * 0.5)
        .outerRadius(radius - 6)

      g.selectAll('path')
        .data(pie(chartData))
        .join('path')
        .attr('d', arc)
        .attr('fill', (_, index) => palette[index] ?? '#94a3b8')
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [chartData])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Total Value</p>
          <p className="font-semibold">{formatCurrency(data.kpis.totalValue, currency)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Transactions</p>
          <p className="font-semibold">{data.kpis.totalTransactions}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Average Value</p>
          <p className="font-semibold">{formatCurrencyCompact(data.kpis.averageValue, currency)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-muted-foreground">Top Share</p>
          <p className="font-semibold">{formatShare(data.kpis.topShare)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[240px,1fr]">
        <div ref={containerRef} className="flex items-center justify-center">
          <svg ref={svgRef} />
        </div>

        <div className="space-y-2">
          {chartData.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
              <span className="truncate text-muted-foreground">{row.name}</span>
              <span className="font-medium">
                {formatCurrencyCompact(row.totalValue, currency)} ({formatShare(row.shareOfTotal)})
              </span>
            </div>
          ))}
        </div>
      </div>

      <BreakdownTable rows={data.rows} currency={currency} />
    </div>
  )
}

export function BreakdownChartCard({
  payments,
  receipts,
  currency = 'SGD',
}: BreakdownChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Overview Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="payments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="receipts">Receipts</TabsTrigger>
          </TabsList>

          <TabsContent value="payments">
            <BreakdownChartPanel data={payments} currency={currency} />
          </TabsContent>

          <TabsContent value="receipts">
            <BreakdownChartPanel data={receipts} currency={currency} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
