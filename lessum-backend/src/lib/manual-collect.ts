import { todayInKst } from './collect-schedule.js'

export const MANUAL_COLLECT_INTERVAL_MS = 60 * 1000
export const MANUAL_COLLECT_DAILY_LIMIT = 10

export function isManualRunTooSoon(
  lastCreatedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!lastCreatedAt) {
    return false
  }
  const elapsed = now.getTime() - new Date(lastCreatedAt).getTime()
  return elapsed < MANUAL_COLLECT_INTERVAL_MS
}

export function manualCollectDayStart(now: Date = new Date()): string {
  return new Date(`${todayInKst(now)}T00:00:00+09:00`).toISOString()
}

export function isManualDailyLimitReached(todayCount: number): boolean {
  return todayCount >= MANUAL_COLLECT_DAILY_LIMIT
}
