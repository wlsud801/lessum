import { nextCollectDate, type ArrivalDay } from './collect-schedule.js'
import { ApiError } from './errors.js'

export const MAIL_CREDENTIAL_STORAGE_CONSENT_VERSION = '2026-10-28'

export interface CardArrivalRow {
  issuer: string
  arrival_day: number | null
  arrival_is_month_end: boolean
}

export function assertStorageConsent(body: unknown) {
  const consent =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>).storage_consent
      : undefined

  if (consent !== true) {
    throw new ApiError(
      400,
      'CONSENT_REQUIRED',
      '자동 등록에 필요한 정보 보관에 동의해주세요.',
    )
  }
}

export function buildNextDates(
  rows: CardArrivalRow[],
  today: string,
): Record<string, string> {
  return Object.fromEntries(
    rows.map((row) => {
      const arrival: ArrivalDay = row.arrival_is_month_end
        ? 'last'
        : (row.arrival_day as number)
      return [row.issuer, nextCollectDate(arrival, today)]
    }),
  )
}

export function earliestDate(dates: Record<string, string>): string | null {
  const values = Object.values(dates).sort()
  return values[0] ?? null
}
