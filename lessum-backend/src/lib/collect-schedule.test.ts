import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isValidDateString, nextCollectDate, todayInKst } from './collect-schedule.js'

describe('nextCollectDate', () => {
  it('Figma 예시와 같은 결과를 만든다 (기준일 2026-10-21)', () => {
    assert.equal(nextCollectDate(25, '2026-10-21'), '2026-10-25')
    assert.equal(nextCollectDate(20, '2026-10-21'), '2026-11-20')
    assert.equal(nextCollectDate(26, '2026-10-21'), '2026-10-26')
    assert.equal(nextCollectDate('last', '2026-10-21'), '2026-10-31')
  })

  it('도착일이 오늘이면 오늘을 반환한다', () => {
    assert.equal(nextCollectDate(21, '2026-10-21'), '2026-10-21')
  })

  it('이미 지난 날짜는 다음 달로 넘긴다', () => {
    assert.equal(nextCollectDate(20, '2026-10-21'), '2026-11-20')
  })

  it('해당 날짜가 없는 달은 말일로 처리한다', () => {
    assert.equal(nextCollectDate(31, '2026-11-05'), '2026-11-30')
    assert.equal(nextCollectDate(30, '2026-02-10'), '2026-02-28')
    assert.equal(nextCollectDate(29, '2026-02-10'), '2026-02-28')
  })

  it('윤년 2월의 말일을 처리한다', () => {
    assert.equal(nextCollectDate('last', '2028-02-10'), '2028-02-29')
    assert.equal(nextCollectDate(31, '2028-02-10'), '2028-02-29')
  })

  it('말일 옵션은 지난 뒤에 다음 달 말일로 넘어간다', () => {
    assert.equal(nextCollectDate('last', '2026-10-31'), '2026-10-31')
    assert.equal(nextCollectDate('last', '2026-11-01'), '2026-11-30')
  })

  it('해당 월의 말일이 기준일보다 앞서면 다음 달로 넘어간다', () => {
    assert.equal(nextCollectDate(31, '2026-04-30'), '2026-04-30')
    assert.equal(nextCollectDate(15, '2026-04-30'), '2026-05-15')
  })

  it('12월에서 다음 해로 넘어간다', () => {
    assert.equal(nextCollectDate(15, '2026-12-30'), '2027-01-15')
    assert.equal(nextCollectDate('last', '2026-12-31'), '2026-12-31')
  })

  it('다음 달이 짧아도 말일로 보정한다', () => {
    assert.equal(nextCollectDate(31, '2027-01-31'), '2027-01-31')
    assert.equal(nextCollectDate(30, '2027-01-31'), '2027-02-28')
  })
})

describe('todayInKst', () => {
  it('UTC 15시 이후는 한국 시간으로 다음 날이다', () => {
    assert.equal(todayInKst(new Date('2026-10-27T15:00:00Z')), '2026-10-28')
    assert.equal(todayInKst(new Date('2026-10-27T14:59:59Z')), '2026-10-27')
  })

  it('연말에도 날짜가 올바르게 넘어간다', () => {
    assert.equal(todayInKst(new Date('2026-12-31T15:00:00Z')), '2027-01-01')
  })
})

describe('isValidDateString', () => {
  it('실제 존재하는 날짜만 허용한다', () => {
    assert.ok(isValidDateString('2026-10-01'))
    assert.ok(isValidDateString('2028-02-29'))
    assert.ok(!isValidDateString('2026-02-29'))
    assert.ok(!isValidDateString('2026-13-01'))
    assert.ok(!isValidDateString('2026-10-32'))
  })

  it('형식이 다르면 거부한다', () => {
    assert.ok(!isValidDateString('2026.10.01'))
    assert.ok(!isValidDateString('2026-1-1'))
    assert.ok(!isValidDateString(''))
  })
})
