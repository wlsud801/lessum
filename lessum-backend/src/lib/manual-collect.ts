export const MANUAL_COLLECT_INTERVAL_MS = 5 * 60 * 1000

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
