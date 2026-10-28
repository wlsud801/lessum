import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAttachment, parseEmail } from './email.js'
import { StatementFormatError } from './errors.js'
import { buildEmail, wooriFixture } from './fixtures.js'
import { encryptVestmail } from './test-support.js'
import { parseWoori } from './woori.js'

function expectFormatError(run: () => unknown, message?: RegExp) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof StatementFormatError &&
      (message === undefined || message.test(error.message)),
  )
}

const REFUND_ONLY = `<html><body>결제일 2026년 10월 12일<table><thead><tr><th>이용일자 이용가맹점 납부하실금액</th></tr></thead><tbody>
  <tr><td>09/01</td><td>환급금</td><td>-100</td><td></td><td></td><td>-100</td><td></td><td></td><td></td><td>-100</td><td></td><td></td><td></td></tr>
  <tr><td>통합청구합계</td><td></td><td></td><td></td><td>-100</td><td>0</td></tr>
  </tbody></table></body></html>`

describe('parseWoori', () => {
  it('환급은 음수로 보존하고 합계는 맞춰진다 (원본 Python 테스트)', () => {
    const result = parseWoori(REFUND_ONLY)

    assert.equal(result.status, 'parsed')
    assert.equal(result.transactions[0].kind, 'refund')
    assert.equal(result.transactions[0].original_amount, -100)
    assert.equal(result.transactions[0].billed_principal_krw, -100)
  })

  it('정상 명세서는 parsed이고 합계 검증을 통과한다', () => {
    const result = parseWoori(wooriFixture())

    assert.equal(result.status, 'parsed')
    assert.equal(result.validation?.row_count, 5)
    assert.equal(result.validation?.principal_matches, true)
    assert.equal(result.validation?.fees_match, true)
    assert.deepEqual(result.context, {
      payment_date: '2026-10-12',
      statement_month: '2026-10',
    })
  })

  it('카드 구분 행((...)으로 시작)을 이후 거래의 card_label로 붙인다', () => {
    const rows = parseWoori(wooriFixture()).transactions

    assert.deepEqual(
      rows.map((row) => row.card_label),
      ['(본인 신용 1234)', '(본인 신용 1234)', '(본인 체크 5678)', '(본인 체크 5678)', '(본인 체크 5678)'],
    )
  })

  it('체크카드이고 청구액이 0이면 통화와 금액을 비우고 확인 대상으로 표시한다', () => {
    const row = parseWoori(wooriFixture()).transactions[2]

    assert.equal(row.merchant, '체크상점')
    assert.equal(row.currency, null)
    assert.equal(row.amount_krw, null)
    assert.equal(row.original_amount, 50)
    assert.equal(row.requires_review, true)
    assert.ok(
      row.review_reasons.includes('check_debit_currency_and_transaction_type_require_review'),
    )
  })

  it('체크카드라도 청구액이 0이 아니면 일반 거래로 둔다', () => {
    const html = wooriFixture({ total: '350' }).replace(
      '<td>50</td><td></td><td></td><td>0</td>',
      '<td>50</td><td></td><td></td><td>50</td>',
    )
    const row = parseWoori(html).transactions[2]

    assert.equal(row.currency, 'KRW')
    assert.equal(row.amount_krw, 50)
  })

  it('같은 가맹점·같은 금액의 구매를 합치지 않는다', () => {
    const rows = parseWoori(wooriFixture()).transactions

    assert.equal(rows[0].merchant, rows[1].merchant)
    assert.equal(rows[0].original_amount, rows[1].original_amount)
    assert.notEqual(rows[0].source_row, rows[1].source_row)
  })

  it('연도는 결제일 기준으로 추정하고 확인 사유를 남긴다', () => {
    const row = parseWoori(wooriFixture()).transactions[0]

    assert.equal(row.transaction_date, '2026-09-01')
    assert.equal(row.date_basis, 'inferred_from_payment_date')
    assert.ok(row.review_reasons.includes('transaction_year_inferred'))
  })

  it('원본 행 번호는 머리글 행을 포함한 표 전체 기준이다', () => {
    const rows = parseWoori(wooriFixture()).transactions

    assert.deepEqual(
      rows.map((row) => row.source_row),
      ['transactions:2', 'transactions:3', 'transactions:5', 'transactions:6', 'transactions:7'],
    )
  })

  it('합계나 수수료가 맞지 않으면 needs_review이다 (실패 시 닫힘)', () => {
    assert.equal(parseWoori(wooriFixture({ total: '301' })).status, 'needs_review')
    assert.equal(parseWoori(wooriFixture({ fee: '11' })).status, 'needs_review')
  })

  it('해석하지 못한 날짜 행이 있으면 needs_review이다', () => {
    const html = wooriFixture({
      extraRows: '<tr><td>9.5 해석불가</td><td>x</td></tr>',
    })
    const result = parseWoori(html)

    assert.equal(result.status, 'needs_review')
    assert.equal(result.validation?.unparsed_dated_rows, 1)
  })

  it('거래 행의 열 수가 바뀌면 거부한다', () => {
    const html = wooriFixture({
      extraRows: '<tr><td>09/09</td><td>열부족</td><td>1</td></tr>',
    })

    expectFormatError(() => parseWoori(html), /columns changed/)
  })

  it('금액이 아닌 값은 0으로 만들지 않고 거부한다', () => {
    expectFormatError(
      () => parseWoori(wooriFixture().replace('<td>100</td><td></td><td></td><td>100</td><td>10</td>', '<td>1.5</td><td></td><td></td><td>100</td><td>10</td>')),
      /monetary/,
    )
  })

  it('거래 표나 결제일이 없으면 거부한다', () => {
    expectFormatError(() => parseWoori('<html><body>결제일 2026년 10월 12일</body></html>'), /table missing/)
    expectFormatError(() => parseWoori(wooriFixture().replace('결제일 2026년 10월 12일', '')), /payment date/)
  })

  it('거래 행이 하나도 없으면 거부한다', () => {
    expectFormatError(
      () => parseWoori(REFUND_ONLY.replace(/<tr><td>09\/01[\s\S]*?<\/tr>/, '')),
      /No verified transaction rows/,
    )
  })
})

describe('우리카드 암호화 첨부', () => {
  it('비밀번호 없이는 password_required, 있으면 복호화 후 파싱한다', async () => {
    const encrypted = encryptVestmail(wooriFixture(), 'woori-pw')
    const data = buildEmail([{ filename: 'woori.html', content: encrypted }])

    assert.equal(parseAttachment('woori', encrypted).status, 'password_required')

    const result = await parseEmail(data, 'woori', 'woori-pw')
    assert.equal(result.status, 'parsed')
    assert.equal(result.issuer, 'woori')
    assert.equal(result.transactions.length, 5)
    assert.ok(result.transactions.every((row) => row.source_row_id))
  })

  it('비밀번호가 틀리면 거부한다', async () => {
    const data = buildEmail([
      { filename: 'woori.html', content: encryptVestmail(wooriFixture(), 'right') },
    ])

    await assert.rejects(
      parseEmail(data, 'woori', 'wrong'),
      (error: unknown) =>
        error instanceof StatementFormatError && /Password incorrect/.test(error.message),
    )
  })
})
