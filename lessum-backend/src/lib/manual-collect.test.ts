import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isManualDailyLimitReached,
  isManualRunTooSoon,
  manualCollectDayStart,
} from './manual-collect.js'

describe('isManualRunTooSoon', () => {
  const now = new Date('2026-11-09T12:00:00.000Z')

  it('이전 수동 실행이 없으면 허용한다', () => {
    assert.equal(isManualRunTooSoon(null, now), false)
  })

  it('1분이 지나지 않았으면 거절한다', () => {
    assert.equal(isManualRunTooSoon('2026-11-09T11:59:30.000Z', now), true)
    assert.equal(isManualRunTooSoon('2026-11-09T11:59:00.001Z', now), true)
  })

  it('정확히 1분이 지났으면 허용한다', () => {
    assert.equal(isManualRunTooSoon('2026-11-09T11:59:00.000Z', now), false)
  })

  it('1분이 지났으면 허용한다', () => {
    assert.equal(isManualRunTooSoon('2026-11-09T11:55:00.000Z', now), false)
  })
})

describe('manualCollectDayStart', () => {
  it('한국 시간 자정을 하루의 시작으로 본다', () => {
    assert.equal(
      manualCollectDayStart(new Date('2026-11-09T12:00:00.000Z')),
      '2026-11-08T15:00:00.000Z',
    )
  })

  it('UTC로는 전날이어도 한국 날짜 기준으로 계산한다', () => {
    assert.equal(
      manualCollectDayStart(new Date('2026-11-09T15:30:00.000Z')),
      '2026-11-09T15:00:00.000Z',
    )
  })
})

describe('isManualDailyLimitReached', () => {
  it('오늘 9번까지는 허용한다', () => {
    assert.equal(isManualDailyLimitReached(9), false)
  })

  it('오늘 10번을 했으면 거절한다', () => {
    assert.equal(isManualDailyLimitReached(10), true)
    assert.equal(isManualDailyLimitReached(11), true)
  })
})
