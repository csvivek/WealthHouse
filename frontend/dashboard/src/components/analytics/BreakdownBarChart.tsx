'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as d3 from 'd3'
import { formatCurrencyCompact } from '@/lib/format'
import type { AnalyticsBreakdownRow } from '@/app/api/analytics/breakdown/route'

interface BreakdownBarChartProps {
  rows: AnalyticsBreakdownRow[]
  currency?: string
  onRowClick: (row: AnalyticsBreakdownRow) => void
}

const BAR_HEIGHT = 36
const BAR_GAP = 8
const LABEL_WIDTH = 160
const AMOUNT_WIDTH = 90
const MARGIN = { top: 8, right: 16, bottom: 8, left: 8 }

function colorForIndex(index: number, colorHex: string | null): string {
  if (colorHex) return colorHex
  const style = getComputedStyle(document.documentElement)
  const slot = (index % 6) + 1
  const value = style.getPropertyValue(`--chart-${slot}`).trim()
  return value ? `oklch(${value})` : '#94a3b8'
}

export function BreakdownBarChart({ rows, currency = 'SGD', onRowClick }: BreakdownBarChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const topRows = useMemo(() => rows.slice(0, 20), [rows])
  const maxAmount = useMemo(() => Math.max(...topRows.map((r) => r.amount), 1), [topRows])

  useEffect(() => {
    const svg = svgRef.current
    const container = containerRef.current
    if (!svg || !container || topRows.length === 0) return

    const draw = () => {
      const containerWidth = container.clientWidth
      const barAreaWidth = containerWidth - LABEL_WIDTH - AMOUNT_WIDTH - MARGIN.left - MARGIN.right
      const totalHeight = topRows.length * (BAR_HEIGHT + BAR_GAP) + MARGIN.top + MARGIN.bottom

      const root = d3.select(svg)
        .attr('width', containerWidth)
        .attr('height', totalHeight)

      root.selectAll('*').remove()

      const g = root.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

      const xScale = d3.scaleLinear().domain([0, maxAmount]).range([0, barAreaWidth])

      topRows.forEach((row, i) => {
        const y = i * (BAR_HEIGHT + BAR_GAP)
        const barWidth = xScale(row.amount)
        const color = colorForIndex(i, row.colorHex)
        const rowG = g.append('g')
          .attr('transform', `translate(0,${y})`)
          .style('cursor', 'pointer')
          .on('click', () => onRowClick(row))
          .on('mouseenter', function () {
            d3.select(this).select('rect.bar').attr('opacity', 0.85)
          })
          .on('mouseleave', function () {
            d3.select(this).select('rect.bar').attr('opacity', 1)
          })

        // Background track
        rowG.append('rect')
          .attr('x', LABEL_WIDTH)
          .attr('y', (BAR_HEIGHT - 20) / 2)
          .attr('width', barAreaWidth)
          .attr('height', 20)
          .attr('rx', 4)
          .attr('fill', 'rgba(148,163,184,0.1)')

        // Filled bar
        rowG.append('rect')
          .classed('bar', true)
          .attr('x', LABEL_WIDTH)
          .attr('y', (BAR_HEIGHT - 20) / 2)
          .attr('width', 0)
          .attr('height', 20)
          .attr('rx', 4)
          .attr('fill', color)
          .transition()
          .duration(450)
          .ease(d3.easeCubicOut)
          .attr('width', Math.max(barWidth, 2))

        // Label (left)
        rowG.append('text')
          .attr('x', 0)
          .attr('y', BAR_HEIGHT / 2)
          .attr('dy', '0.35em')
          .attr('fill', 'currentColor')
          .attr('font-size', '13px')
          .attr('text-anchor', 'start')
          .text(row.label.length > 20 ? `${row.label.slice(0, 18)}…` : row.label)

        // Amount + share (right)
        rowG.append('text')
          .attr('x', LABEL_WIDTH + barAreaWidth + 8)
          .attr('y', BAR_HEIGHT / 2 - 5)
          .attr('dy', '0.35em')
          .attr('fill', 'currentColor')
          .attr('font-size', '13px')
          .attr('font-weight', '500')
          .attr('text-anchor', 'start')
          .text(formatCurrencyCompact(row.amount, currency))

        rowG.append('text')
          .attr('x', LABEL_WIDTH + barAreaWidth + 8)
          .attr('y', BAR_HEIGHT / 2 + 9)
          .attr('dy', '0.35em')
          .attr('fill', 'rgba(148,163,184,0.8)')
          .attr('font-size', '11px')
          .attr('text-anchor', 'start')
          .text(`${row.share}%`)
      })
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(container)
    return () => observer.disconnect()
  }, [topRows, maxAmount, currency, onRowClick])

  if (topRows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No data for the selected filters
      </div>
    )
  }

  const chartHeight = topRows.length * (BAR_HEIGHT + BAR_GAP) + MARGIN.top + MARGIN.bottom

  return (
    <div ref={containerRef} className="w-full">
      <svg ref={svgRef} style={{ height: chartHeight }} className="w-full text-foreground" />
    </div>
  )
}
