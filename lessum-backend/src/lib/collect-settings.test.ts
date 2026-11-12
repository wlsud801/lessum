import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  buildCardRows,
  parseCollectSettingsInput,
  statementPasswordContext,
} from './collect-settings.js'
import { decryptSecret } from './crypto.js'
import { ApiError } from './errors.js'

const TODAY = '2026-10-21'
const USER_ID = 'user-1'

const validBody = () => ({
  mailbox_imap_name: '&zK2tbAC3rLDIHA-',
  start_date: '2026-10-01',
  cards: [
    { issuer: 'hyundai', arrival_day: 25, statement_password: 'pw-h' },
    { issuer: 'lotte', arrival_day: 20 },
    { issuer: 'samsung', arrival_day: 'last' },
  ],
})

function expectCode(run: () => unknown, code: string) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof ApiError && error.status === 400 && error.code === code,
  )
}

describe('parseCollectSettingsInput', () => {
  it('올바른 요청을 파싱하고 메일함 표시 이름을 디코딩한다', () => {
    const input = parseCollectSettingsInput(validBody(), TODAY)

    assert.equal(input.mailboxImapName, '&zK2tbAC3rLDIHA-')
    assert.equal(input.mailboxName, '청구·결제')
    assert.equal(input.startDate, '2026-10-01')
    assert.deepEqual(
      input.cards.map((card) => [card.issuer, card.arrivalDay]),
      [['hyundai', 25], ['lotte', 20], ['samsung', 'last']],
    )
  })

  it('시작일이 오늘인 요청은 허용한다', () => {
    const body = { ...validBody(), start_date: TODAY }

    assert.equal(parseCollectSettingsInput(body, TODAY).startDate, TODAY)
  })

  it('메일함이 없거나 잘못되면 거부한다', () => {
    for (const value of [undefined, '', 123, '청구·결제', '&zK2tbAC3rLDIHA', 'a'.repeat(513)]) {
      expectCode(
        () => parseCollectSettingsInput({ ...validBody(), mailbox_imap_name: value }, TODAY),
        'INVALID_MAILBOX',
      )
    }
  })

  it('시작일이 없거나 형식이 틀리거나 미래면 거부한다', () => {
    for (const value of [undefined, '2026.10.01', '2026-02-30', '2026-10-22']) {
      expectCode(
        () => parseCollectSettingsInput({ ...validBody(), start_date: value }, TODAY),
        'INVALID_START_DATE',
      )
    }
  })

  it('카드가 비어 있거나 중복이면 거부한다', () => {
    expectCode(() => parseCollectSettingsInput({ ...validBody(), cards: [] }, TODAY), 'INVALID_CARDS')
    expectCode(() => parseCollectSettingsInput({ ...validBody(), cards: 'x' }, TODAY), 'INVALID_CARDS')
    expectCode(
      () =>
        parseCollectSettingsInput(
          {
            ...validBody(),
            cards: [
              { issuer: 'lotte', arrival_day: 20 },
              { issuer: 'lotte', arrival_day: 21 },
            ],
          },
          TODAY,
        ),
      'INVALID_CARDS',
    )
  })

  it('알 수 없는 카드사는 거부하고 신한카드는 허용한다', () => {
    const withCard = (card: unknown) => ({ ...validBody(), cards: [card] })

    expectCode(
      () => parseCollectSettingsInput(withCard({ issuer: 'unknown', arrival_day: 1 }), TODAY),
      'INVALID_ISSUER',
    )
    const parsed = parseCollectSettingsInput(
      withCard({ issuer: 'shinhan', arrival_day: 1 }),
      TODAY,
    )
    assert.equal(parsed.cards[0].issuer, 'shinhan')
  })

  it('도착일은 1~31 정수 또는 last만 허용한다', () => {
    for (const value of [0, 32, 1.5, '25', null, undefined, 'month-end']) {
      expectCode(
        () =>
          parseCollectSettingsInput(
            { ...validBody(), cards: [{ issuer: 'lotte', arrival_day: value }] },
            TODAY,
          ),
        'INVALID_ARRIVAL_DAY',
      )
    }
  })

  it('명세서 암호 규칙: 없음·빈 문자열은 유지, null은 삭제, 문자열은 교체', () => {
    const passwordOf = (statement_password: unknown) =>
      parseCollectSettingsInput(
        { ...validBody(), cards: [{ issuer: 'hyundai', arrival_day: 25, statement_password }] },
        TODAY,
      ).cards[0].statementPassword

    assert.equal(passwordOf(undefined), undefined)
    assert.equal(passwordOf(''), undefined)
    assert.equal(passwordOf(null), null)
    assert.equal(passwordOf('new-pw'), 'new-pw')
  })

  it('암호가 필요 없는 카드에 암호를 보내면 거부한다', () => {
    expectCode(
      () =>
        parseCollectSettingsInput(
          { ...validBody(), cards: [{ issuer: 'shinhan', arrival_day: 20, statement_password: 'x' }] },
          TODAY,
        ),
      'STATEMENT_PASSWORD_NOT_NEEDED',
    )
  })

  it('암호 형식이 잘못되었거나 너무 길면 거부한다', () => {
    for (const value of [123, 'x'.repeat(129)]) {
      expectCode(
        () =>
          parseCollectSettingsInput(
            { ...validBody(), cards: [{ issuer: 'hyundai', arrival_day: 25, statement_password: value }] },
            TODAY,
          ),
        'INVALID_STATEMENT_PASSWORD',
      )
    }
  })

  it('본문이 객체가 아니어도 안전하게 거부한다', () => {
    for (const body of [undefined, null, 'x', 1, []]) {
      assert.throws(() => parseCollectSettingsInput(body, TODAY), ApiError)
    }
  })
})

describe('buildCardRows', () => {
  const key = randomBytes(32)

  it('도착일과 다음 조회일을 DB 형식으로 변환한다', () => {
    const rows = buildCardRows(USER_ID, parseCollectSettingsInput(validBody(), TODAY), [], TODAY, key)
    const byIssuer = Object.fromEntries(rows.map((row) => [row.issuer, row]))

    assert.equal(byIssuer.hyundai.arrival_day, 25)
    assert.equal(byIssuer.hyundai.arrival_is_month_end, false)
    assert.equal(byIssuer.hyundai.next_collect_on, '2026-10-25')
    assert.equal(byIssuer.lotte.next_collect_on, '2026-11-20')
    assert.equal(byIssuer.samsung.arrival_day, null)
    assert.equal(byIssuer.samsung.arrival_is_month_end, true)
    assert.equal(byIssuer.samsung.next_collect_on, '2026-10-31')
    assert.ok(rows.every((row) => row.enabled && row.user_id === USER_ID))
  })

  it('새 명세서 암호는 카드사별 컨텍스트로 암호화한다', () => {
    const [row] = buildCardRows(
      USER_ID,
      parseCollectSettingsInput({ ...validBody(), cards: [{ issuer: 'hyundai', arrival_day: 25, statement_password: 'pw-h' }] }, TODAY),
      [],
      TODAY,
      key,
    )

    assert.ok(row.statement_password_encrypted)
    assert.ok(!row.statement_password_encrypted.includes('pw-h'))
    assert.equal(
      decryptSecret(key, row.statement_password_encrypted, statementPasswordContext(USER_ID, 'hyundai')),
      'pw-h',
    )
    assert.throws(() =>
      decryptSecret(key, row.statement_password_encrypted!, statementPasswordContext(USER_ID, 'woori')),
    )
  })

  it('암호를 보내지 않으면 기존 암호문을 유지한다', () => {
    const [row] = buildCardRows(
      USER_ID,
      parseCollectSettingsInput({ ...validBody(), cards: [{ issuer: 'hyundai', arrival_day: 25 }] }, TODAY),
      [{ issuer: 'hyundai', statement_password_encrypted: 'kept-ciphertext' }],
      TODAY,
      key,
    )

    assert.equal(row.statement_password_encrypted, 'kept-ciphertext')
  })

  it('null을 보내면 기존 암호문을 지운다', () => {
    const [row] = buildCardRows(
      USER_ID,
      parseCollectSettingsInput({ ...validBody(), cards: [{ issuer: 'hyundai', arrival_day: 25, statement_password: null }] }, TODAY),
      [{ issuer: 'hyundai', statement_password_encrypted: 'old' }],
      TODAY,
      key,
    )

    assert.equal(row.statement_password_encrypted, null)
  })

  it('기존 행이 없고 암호도 없으면 null이다', () => {
    const [row] = buildCardRows(
      USER_ID,
      parseCollectSettingsInput({ ...validBody(), cards: [{ issuer: 'lotte', arrival_day: 20 }] }, TODAY),
      [],
      TODAY,
      key,
    )

    assert.equal(row.statement_password_encrypted, null)
  })
})
