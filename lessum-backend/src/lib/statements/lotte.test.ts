import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { StatementFormatError } from './errors.js'
import { lotteFixture } from './fixtures.js'
import { parseLotte } from './lotte.js'

function expectFormatError(run: () => unknown, message?: RegExp) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof StatementFormatError &&
      (message === undefined || message.test(error.message)),
  )
}

describe('parseLotte', () => {
  it('정상 명세서는 parsed이고 합계 검증을 통과한다', () => {
    const result = parseLotte(lotteFixture())

    assert.equal(result.status, 'parsed')
    assert.deepEqual(result.context, {
      payment_date: '2026-01-14',
      statement_month: '2026-01',
    })
    assert.deepEqual(result.validation, {
      row_count: 3,
      review_row_count: 3,
      parsed_billed_principal_krw: 300,
      declared_billed_principal_krw: 300,
      parsed_fees_krw: 0,
      declared_fees_krw: 0,
      fees_match: true,
      principal_matches: true,
      unparsed_dated_rows: 0,
    })
    assert.deepEqual(result.references, [])
    assert.deepEqual(result.warnings, [])
  })

  it('누락된 이용총액을 청구 금액으로 대체하지 않는다', () => {
    const row = parseLotte(lotteFixture({ amount1: '' })).transactions[0]

    assert.equal(row.amount_krw, null)
    assert.equal(row.original_amount, null)
    assert.equal(row.billed_principal_krw, 100)
    assert.ok(row.review_reasons.includes('original_amount_missing'))
  })

  it('같은 가맹점·같은 금액의 구매를 합치지 않고, 연도는 결제일 기준으로 추정한다', () => {
    const rows = parseLotte(lotteFixture()).transactions

    assert.equal(rows.length, 3)
    assert.equal(rows[0].transaction_date, '2025-12-20')
    assert.equal(rows[0].date_basis, 'inferred_from_payment_date')
    assert.equal(rows[0].merchant, rows[1].merchant)
    assert.equal(rows[2].original_amount, 300)
    assert.equal(rows[2].billed_principal_krw, 100)
    assert.equal(rows[2].installment_round, 2)
    assert.equal(rows[2].installment_months, 3)
  })

  it('원본 행 번호는 머리글 행을 포함한 표 전체 기준이다 (중복 방지 키의 일부)', () => {
    const rows = parseLotte(lotteFixture()).transactions

    assert.deepEqual(
      rows.map((row) => row.source_row),
      ['transactions:1', 'transactions:2', 'transactions:3'],
    )
  })

  it('합계가 맞지 않으면 needs_review이다 (실패 시 닫힘)', () => {
    assert.equal(parseLotte(lotteFixture({ total: '301' })).status, 'needs_review')
    assert.equal(parseLotte(lotteFixture({ fee: '1' })).status, 'needs_review')
  })

  it('행 정보 필드가 올바르게 채워진다', () => {
    const row = parseLotte(lotteFixture()).transactions[2]

    assert.equal(row.issuer, 'lotte')
    assert.equal(row.raw_date, '12.21')
    assert.equal(row.merchant, '할부상점')
    assert.equal(row.currency, 'KRW')
    assert.equal(row.fee_krw, 0)
    assert.equal(row.kind, 'purchase_candidate')
    assert.equal(row.posting_status, 'candidate')
    assert.deepEqual(row.review_reasons, [
      'transaction_year_inferred',
      'installment_purchase_reconciliation_required',
    ])
    assert.equal(row.requires_review, true)
  })

  it('환급(음수 금액)은 refund로 분류한다', () => {
    const html = lotteFixture().replace('<td>300</td><td>2/3</td>', '<td>-300</td><td>2/3</td>')

    assert.equal(parseLotte(html).transactions[2].kind, 'refund')
  })

  it('표 열 수가 바뀌면 거부한다', () => {
    const html = lotteFixture().replace(
      '<td></td><td></td><td></td></tr>\n    <tr><td><em class="useday">12.20</em>같은상점</td><td>100',
      '<td></td><td></td></tr>\n    <tr><td><em class="useday">12.20</em>같은상점</td><td>100',
    )

    expectFormatError(() => parseLotte(html), /columns changed/)
  })

  it('알 수 없는 할부 표기는 거부한다', () => {
    expectFormatError(
      () => parseLotte(lotteFixture().replace('2/3', '두번째')),
      /installment/,
    )
  })

  it('금액이 아닌 값은 0으로 만들지 않고 거부한다', () => {
    expectFormatError(
      () => parseLotte(lotteFixture({ amount1: '12.5' })),
      /monetary/,
    )
  })

  it('결제일(출금일)을 찾지 못하면 거부한다', () => {
    expectFormatError(
      () => parseLotte(lotteFixture().replace('출금일2026년 1월 14일', '')),
      /payment date/,
    )
  })

  it('존재하지 않는 결제일은 거부한다', () => {
    expectFormatError(
      () => parseLotte(lotteFixture().replace('2026년 1월 14일', '2026년 2월 30일')),
      /payment date/,
    )
  })

  it('거래 표가 없거나 둘 이상이면 거부한다', () => {
    expectFormatError(
      () => parseLotte('<html><body>출금일2026년 1월 14일</body></html>'),
      /table missing or ambiguous/,
    )
    const table = lotteFixture().match(/<table>[\s\S]*<\/table>/)![0]
    expectFormatError(
      () => parseLotte(lotteFixture().replace('</body>', `${table}</body>`)),
      /table missing or ambiguous/,
    )
  })

  it('거래 행이 하나도 없으면 거부한다', () => {
    const html = lotteFixture().replace(/<tr><td><em[\s\S]*?<\/tr>/g, '')

    expectFormatError(() => parseLotte(html), /No verified transaction rows/)
  })

  it('해석하지 못한 날짜 행이 있으면 needs_review이다', () => {
    const html = lotteFixture().replace(
      '<tr><th>카드이용합계</th>',
      '<tr><td headers="card_field1">12.22 해석불가</td><td></td></tr><tr><th>카드이용합계</th>',
    )
    const result = parseLotte(html)

    assert.equal(result.status, 'needs_review')
    assert.equal(result.validation?.unparsed_dated_rows, 1)
  })

  it('tbody 없이 tr이 표 바로 아래 있어도 같은 행 번호로 읽는다', () => {
    const html = lotteFixture().replace('<tbody>', '').replace('</tbody>', '')
    const rows = parseLotte(html).transactions

    assert.deepEqual(
      rows.map((row) => row.source_row),
      ['transactions:1', 'transactions:2', 'transactions:3'],
    )
  })

  it('스크립트 안의 텍스트는 결제일로 오인하지 않는다', () => {
    const html = lotteFixture().replace(
      '출금일2026년 1월 14일',
      '<script>var x = "출금일2025년 5월 5일"</script>출금일2026년 1월 14일',
    )

    assert.equal(parseLotte(html).context?.payment_date, '2026-01-14')
  })
})
