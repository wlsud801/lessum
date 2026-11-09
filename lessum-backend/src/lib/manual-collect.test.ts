import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isManualRunTooSoon } from './manual-collect.js'

describe('isManualRunTooSoon', () => {
  const now = new Date('2026-11-09T12:00:00.000Z')

  it('이전 수동 실행이 없으면 허용한다', () => {
    assert.equal(isManualRunTooSoon(null, now), false)
  })

  it('5분이 지나지 않았으면 거절한다', () => {
    assert.equal(isManualRunTooSoon('2026-11-09T11:56:00.000Z', now), true)
    assert.equal(isManualRunTooSoon('2026-11-09T11:55:00.001Z', now), true)
  })

  it('정확히 5분이 지났으면 허용한다', () => {
    assert.equal(isManualRunTooSoon('2026-11-09T11:55:00.000Z', now), false)
  })

  it('5분이 지났으면 허용한다', () => {
    assert.equal(isManualRunTooSoon('2026-11-09T11:00:00.000Z', now), false)
  })
})
