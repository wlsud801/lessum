import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { StatementFormatError } from './errors.js'
import { shinhanFixture } from './fixtures.js'
import { parseShinhan } from './shinhan.js'

function expectFormatError(run: () => unknown, message?: RegExp) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof StatementFormatError &&
      (message === undefined || message.test(error.message)),
  )
}

describe('parseShinhan', () => {
  it('정상 명세서는 parsed이고 합계·건수 검증을 통과한다', () => {
    const result = parseShinhan(shinhanFixture())

    assert.equal(result.status, 'parsed')
    assert.deepEqual(result.context, {
      payment_date: '2026-11-14',
      statement_month: '2026-11',
    })
    assert.deepEqual(result.validation, {
      row_count: 4,
      review_row_count: 2,
      parsed_billed_principal_krw: 1246,
      declared_billed_principal_krw: 1246,
      parsed_fees_krw: 14,
      declared_fees_krw: 14,
      fees_match: true,
      principal_matches: true,
      unparsed_dated_rows: 0,
      purchase_row_count: 4,
      declared_purchase_count: 4,
      purchase_count_matches: true,
    })
  })

  it('거래 날짜는 연도까지 명시된 explicit 기준이다', () => {
    const row = parseShinhan(shinhanFixture()).transactions[0]

    assert.equal(row.transaction_date, '2026-10-06')
    assert.equal(row.date_basis, 'explicit')
    assert.ok(!row.review_reasons.includes('transaction_year_inferred'))
  })

  it('할인 행은 할인 전 이용금액을 유지하고 혜택 정보를 담는다', () => {
    const row = parseShinhan(shinhanFixture()).transactions[0]

    assert.equal(row.issuer, 'shinhan')
    assert.equal(row.merchant, '할인상점')
    assert.equal(row.amount_krw, 500)
    assert.equal(row.billed_principal_krw, 450)
    assert.equal(row.card_label, '본인443')
    assert.deepEqual(row.benefits, [{ label: '할인', amount_krw: -50 }])
    assert.equal(row.section, '일시불 소계')
    assert.equal(row.requires_review, false)
  })

  it('이용금액이 비어 있으면 이번달 원금을 이용금액으로 사용한다', () => {
    const row = parseShinhan(shinhanFixture()).transactions[1]

    assert.equal(row.amount_krw, 300)
    assert.equal(row.original_amount, 300)
    assert.ok(!row.review_reasons.includes('original_amount_missing'))
  })

  it('할부 행은 기간/회차를 파싱하고 확인 대상으로 둔다', () => {
    const row = parseShinhan(shinhanFixture()).transactions[2]

    assert.equal(row.installment_months, 3)
    assert.equal(row.installment_round, 1)
    assert.equal(row.fee_krw, 10)
    assert.ok(
      row.review_reasons.includes('installment_purchase_reconciliation_required'),
    )
  })

  it('해외이용 행은 청구금액(원금+수수료)으로 계산하고 확인 대상으로 둔다', () => {
    const row = parseShinhan(shinhanFixture()).transactions[3]

    assert.equal(row.amount_krw, 300)
    assert.equal(row.original_amount, 22)
    assert.equal(row.currency, null)
    assert.equal(row.section, '해외이용 일시불 소계')
    assert.ok(row.review_reasons.includes('foreign_currency_requires_review'))
    assert.equal(row.requires_review, true)
  })

  it('합계가 맞지 않으면 needs_review이다 (실패 시 닫힘)', () => {
    assert.equal(parseShinhan(shinhanFixture({ total: '1,247' })).status, 'needs_review')
    assert.equal(parseShinhan(shinhanFixture({ fee: '15' })).status, 'needs_review')
  })

  it('총합계 건수가 다르면 needs_review이다', () => {
    const result = parseShinhan(shinhanFixture({ count: '5' }))

    assert.equal(result.status, 'needs_review')
    assert.equal(result.validation.purchase_count_matches, false)
  })

  it('날짜 행의 열 수가 바뀌면 거부한다', () => {
    expectFormatError(
      () =>
        parseShinhan(
          shinhanFixture({ extraRows: '<tr><td>26.10.10</td><td>상점</td></tr>' }),
        ),
      /columns changed/,
    )
  })

  it('알 수 없는 할부 표기는 거부한다', () => {
    expectFormatError(
      () => parseShinhan(shinhanFixture().replace('3/1', '세번째')),
      /installment/,
    )
  })

  it('금액이 아닌 값은 0으로 만들지 않고 거부한다', () => {
    expectFormatError(
      () => parseShinhan(shinhanFixture().replace('<td>450</td>', '<td>4.5</td>')),
      /monetary/,
    )
  })

  it('결제일을 찾지 못하면 거부한다', () => {
    expectFormatError(
      () => parseShinhan(shinhanFixture().replace('2026.11.14', '')),
      /payment date/,
    )
  })

  it('존재하지 않는 결제일은 거부한다', () => {
    expectFormatError(
      () => parseShinhan(shinhanFixture().replace('2026.11.14', '2026.2.30')),
      /payment date/,
    )
  })

  it('거래 표가 없거나 둘 이상이면 거부한다', () => {
    expectFormatError(
      () => parseShinhan('<html><body>결제일 :2026.11.14</body></html>'),
      /table missing or ambiguous/,
    )
    const table = shinhanFixture().match(/<table>[\s\S]*<\/table>/)![0]
    expectFormatError(
      () => parseShinhan(shinhanFixture().replace('</body>', `${table}</body>`)),
      /table missing or ambiguous/,
    )
  })

  it('해석하지 못한 날짜 행이 있으면 needs_review이다', () => {
    const result = parseShinhan(
      shinhanFixture({ extraRows: '<tr><td>10/3 해석불가</td><td></td></tr>' }),
    )

    assert.equal(result.status, 'needs_review')
    assert.equal(result.validation.unparsed_dated_rows, 1)
  })

  it('환급(음수 금액)은 refund로 분류한다', () => {
    const html = shinhanFixture({ total: '746' }).replace(
      '<td>500</td><td></td><td>450</td>',
      '<td>-500</td><td></td><td>-50</td>',
    )

    assert.equal(parseShinhan(html).transactions[0].kind, 'refund')
  })
})
