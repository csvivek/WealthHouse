export type DatePeriod =
  | 'this_year'
  | 'last_year'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_week'
  | 'last_week'
  | 'all_history'

export interface DateRange {
  start: string | null
  end: string | null
}

const toIsoDate = (date: Date) => date.toISOString().split('T')[0]

const getQuarterStartMonth = (monthIndex: number) => Math.floor(monthIndex / 3) * 3

export function resolveDatePeriodRange(period: DatePeriod, nowInput: Date = new Date()): DateRange {
  const now = new Date(nowInput)
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (period) {
    case 'this_year':
      return { start: toIsoDate(new Date(year, 0, 1)), end: toIsoDate(now) }
    case 'last_year':
      return { start: toIsoDate(new Date(year - 1, 0, 1)), end: toIsoDate(new Date(year - 1, 11, 31)) }
    case 'this_month':
      return { start: toIsoDate(new Date(year, month, 1)), end: toIsoDate(now) }
    case 'last_month':
      return { start: toIsoDate(new Date(year, month - 1, 1)), end: toIsoDate(new Date(year, month, 0)) }
    case 'this_quarter': {
      const startMonth = getQuarterStartMonth(month) // Q1 Jan-Mar, Q2 Apr-Jun, Q3 Jul-Sep, Q4 Oct-Dec
      return { start: toIsoDate(new Date(year, startMonth, 1)), end: toIsoDate(now) }
    }
    case 'last_quarter': {
      const startMonth = getQuarterStartMonth(month)
      const thisQuarterStart = new Date(year, startMonth, 1)
      const lastQuarterStart = new Date(thisQuarterStart.getFullYear(), thisQuarterStart.getMonth() - 3, 1)
      const lastQuarterEnd = new Date(thisQuarterStart.getFullYear(), thisQuarterStart.getMonth(), 0)
      return { start: toIsoDate(lastQuarterStart), end: toIsoDate(lastQuarterEnd) }
    }
    case 'this_week': {
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const start = new Date(year, month, now.getDate() + mondayOffset)
      return { start: toIsoDate(start), end: toIsoDate(now) }
    }
    case 'last_week': {
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const thisWeekStart = new Date(year, month, now.getDate() + mondayOffset)
      const lastWeekStart = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - 7)
      const lastWeekEnd = new Date(thisWeekStart.getFullYear(), thisWeekStart.getMonth(), thisWeekStart.getDate() - 1)
      return { start: toIsoDate(lastWeekStart), end: toIsoDate(lastWeekEnd) }
    }
    case 'all_history':
      return { start: null, end: null }
    default:
      return { start: null, end: null }
  }
}

export const DATE_PERIOD_LABELS: Record<DatePeriod, string> = {
  this_year: 'This Year',
  last_year: 'Last Year',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_quarter: 'This Quarter',
  last_quarter: 'Last Quarter',
  this_week: 'This Week',
  last_week: 'Last Week',
  all_history: 'All History',
}
