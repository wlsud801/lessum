import type { ArrivalDay } from './types'

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export function todayInKst(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function formatDate(year: number, month: number, day: number): string {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
}

export function nextCollectDate(arrival: ArrivalDay, fromDate: string): string {
  const [year, month, day] = fromDate.split('-').map(Number)

  const pickDay = (targetYear: number, targetMonth: number) => {
    const lastDay = daysInMonth(targetYear, targetMonth)
    return arrival === 'last' ? lastDay : Math.min(arrival, lastDay)
  }

  const thisMonthDay = pickDay(year, month)
  if (thisMonthDay >= day) {
    return formatDate(year, month, thisMonthDay)
  }

  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return formatDate(nextYear, nextMonth, pickDay(nextYear, nextMonth))
}

export function formatDisplayDate(date: string): string {
  return date.replaceAll('-', '.')
}
