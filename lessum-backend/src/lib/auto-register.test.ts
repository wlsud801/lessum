import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertStorageConsent,
  buildNextDates,
  earliestDate,
  type CardArrivalRow,
} from './auto-register.js'
import { ApiError } from './errors.js'

describe('assertStorageConsent', () => {
  it('storage_consent가 true일 때만 통과한다', () => {
    assert.doesNotThrow(() => assertStorageConsent({ storage_consent: true }))
  })

  it('동의가 없거나 true가 아니면 거부한다', () => {
    const bodies = [
      undefined,
      null,
      {},
      { storage_consent: false },
      { storage_consent: 'true' },
      { storage_consent: 1 },
      { consent: true },
      'x',
    ]
    for (const body of bodies) {
      assert.throws(
        () => assertStorageConsent(body),
        (error: unknown) =>
          error instanceof ApiError &&
          error.status === 400 &&
          error.code === 'CONSENT_REQUIRED',
      )
    }
  })
})

describe('buildNextDates', () => {
  const rows: CardArrivalRow[] = [
    { issuer: 'hyundai', arrival_day: 25, arrival_is_month_end: false },
    { issuer: 'lotte', arrival_day: 20, arrival_is_month_end: false },
    { issuer: 'woori', arrival_day: 26, arrival_is_month_end: false },
    { issuer: 'samsung', arrival_day: null, arrival_is_month_end: true },
  ]

  it('카드별 다음 조회일을 계산한다 (Figma 예시, 기준일 2026-10-21)', () => {
    assert.deepEqual(buildNextDates(rows, '2026-10-21'), {
      hyundai: '2026-10-25',
      lotte: '2026-11-20',
      woori: '2026-10-26',
      samsung: '2026-10-31',
    })
  })

  it('기준일이 바뀌면 값도 다시 계산된다', () => {
    assert.equal(buildNextDates(rows, '2026-10-28').hyundai, '2026-11-25')
    assert.equal(buildNextDates(rows, '2026-10-28').samsung, '2026-10-31')
  })

  it('카드가 없으면 빈 객체를 반환한다', () => {
    assert.deepEqual(buildNextDates([], '2026-10-21'), {})
  })
})

describe('earliestDate', () => {
  it('가장 이른 날짜를 반환한다', () => {
    assert.equal(
      earliestDate({ a: '2026-11-20', b: '2026-10-25', c: '2026-10-31' }),
      '2026-10-25',
    )
  })

  it('비어 있으면 null이다', () => {
    assert.equal(earliestDate({}), null)
  })
})
