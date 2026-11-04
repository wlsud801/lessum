import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { attachSource } from './email.js'
import { FOREIGN_HEADERS, PURCHASE_HEADERS, parseExportSheets, type SheetRows } from './samsung-export.js'
import {
  FOREIGN,
  INSTALLMENT,
  ONE,
  REFERENCE,
  sheetsFixture,
  totalRow,
  xlsxFromSheets,
} from './samsung-fixtures.js'
import { parseSamsungExport, parseSamsungXlsx, type SamsungReference } from './samsung.js'
import type { SamsungValidation } from './statement.js'

const parse = (sheets: SheetRows = sheetsFixture(), reference: SamsungReference | null = REFERENCE) =>
  parseSamsungExport(parseExportSheets(sheets), reference ?? undefined)
const validation = (result: ReturnType<typeof parse>) => result.validation as SamsungValidation
const withSheet = (name: string, rows: SheetRows[string]) => ({ ...sheetsFixture(), [name]: rows })
const foreignSheet = (...body: unknown[][]) => [
  ['해외이용'],
  [],
  [...FOREIGN_HEADERS],
  ...body,
  ['', '', '해외매출합계', '', '', '', '', 1, '', 99 * body.length, body.length, 100 * body.length],
]
const purchaseSheet = (name: string, body: unknown[][]) => [[name], [], [...PURCHASE_HEADERS], ...body]

describe('parseSamsungExport', () => {
  it('혜택 행은 구매가 아니고, 같은 구매 두 건은 모두 남으며, 외화 상세가 연결된다 (원본 Python 테스트)', () => {
    const result = parse()

    assert.equal(result.status, 'parsed')
    assert.equal(result.transactions.length, 3)
    assert.equal(validation(result).sections.D0.benefit_continuation_rows, 2)
    assert.equal(result.transactions[0].billed_amount_krw, 90)
    assert.equal(validation(result).linked_foreign_references, 1)
    assert.equal(result.references.length, 2)
  })

  it('합계 행이 맞지 않으면 완료로 보지 않는다 (원본 Python 테스트)', () => {
    const result = parse(sheetsFixture({ footer: 181 }))

    assert.equal(result.status, 'needs_review')
    assert.equal(validation(result).complete, false)
  })

  it('결제월 정보가 없으면 지어내지 않고 확인 필요로 둔다 (원본 Python 테스트)', () => {
    const result = parse(sheetsFixture(), null)

    assert.equal(result.context?.payment_date, null)
    assert.equal(result.context?.statement_month, null)
    assert.equal(result.status, 'needs_review')
    assert.match(result.warnings[0], /no payment date/)
  })

  it('행 필드가 올바르게 채워진다', () => {
    const [first, , installment] = parse().transactions

    assert.equal(first.issuer, 'samsung')
    assert.equal(first.source_row, '일시불:4')
    assert.equal(first.raw_date, '20260902')
    assert.equal(first.transaction_date, '2026-09-02')
    assert.equal(first.date_basis, 'explicit')
    assert.equal(first.merchant, '같은상점')
    assert.equal(first.original_amount, 100)
    assert.equal(first.amount_krw, 100)
    assert.equal(first.billed_principal_krw, 90)
    assert.equal(first.billed_amount_krw, 90)
    assert.equal(first.fee_krw, 0)
    assert.equal(first.section, 'D0')
    assert.equal(first.billed_components_match, true)
    assert.equal(first.requires_review, false)
    assert.deepEqual(first.review_reasons, [])
    assert.equal(first.installment_months, null)
    assert.deepEqual(first.benefits, [
      { label: '청구할인', amount_krw: -5 },
      { label: '해외수수료할인', amount_krw: -5 },
    ])

    assert.equal(installment.section, 'D1')
    assert.equal(installment.installment_months, 3)
    assert.equal(installment.installment_round, 2)
    assert.equal(installment.requires_review, true)
    assert.deepEqual(installment.review_reasons, ['installment_purchase_reconciliation_required'])
    assert.deepEqual(installment.benefits, [{ label: '이자면제', amount_krw: -20 }])
  })

  it('청구 금액이 이용금액과 할인으로 설명되지 않으면 확인 대상이다', () => {
    const bad = [...ONE]
    bad[9] = 91
    const sheets = withSheet('일시불', purchaseSheet('일시불', [bad, ONE, totalRow('일시불', 181)]))
    const result = parse(sheets)

    assert.equal(result.transactions[0].billed_components_match, false)
    assert.ok(result.transactions[0].review_reasons.includes('billed_amount_components_require_review'))
    assert.equal(result.transactions[0].requires_review, true)
    assert.equal(result.status, 'needs_review')
  })

  it('할부 구매는 구성 금액 검사를 건너뛴다', () => {
    const odd = [...INSTALLMENT]
    odd[3] = '999'

    assert.equal(parse(withSheet('할부', purchaseSheet('할부', [odd, totalRow('할부', 100)]))).transactions[2].billed_components_match, true)
  })

  it('외화 상세는 같은 날짜·가맹점·금액의 구매와 하나씩 연결한다', () => {
    const result = parse()
    const foreign = result.references[0]

    assert.equal(foreign.kind, 'foreign_detail_reference')
    assert.equal(foreign.transaction_date, '2026-09-02')
    assert.equal(foreign.linked_purchase_row, '일시불:4')
  })

  it('똑같은 구매가 둘이면 외화 상세 둘이 서로 다른 구매에 연결된다', () => {
    const sheets = withSheet('해외이용', foreignSheet(FOREIGN, FOREIGN))
    const refs = parse(sheets).references.filter((r) => r.kind === 'foreign_detail_reference')

    assert.deepEqual(refs.map((r) => r.linked_purchase_row), ['일시불:4', '일시불:6'])
  })

  it('외화 상세가 구매보다 많으면 남는 것은 연결되지 않아 미완료이다', () => {
    const sheets = withSheet('해외이용', foreignSheet(FOREIGN, FOREIGN, FOREIGN))
    const result = parse(sheets, { ...REFERENCE, validation: { ...REFERENCE.validation, sections: { ...REFERENCE.validation.sections, DE: { declared_count: 3 } } } })
    const refs = result.references.filter((r) => r.kind === 'foreign_detail_reference')

    assert.equal(refs[2].linked_purchase_row, null)
    assert.equal(validation(result).linked_foreign_references, 2)
    assert.equal(validation(result).foreign_reference_count, 3)
    assert.equal(result.status, 'needs_review')
  })

  it('연결되는 구매가 없는 외화 상세는 미완료이다', () => {
    const other = [...FOREIGN]
    other[2] = '다른상점'
    const result = parse(withSheet('해외이용', foreignSheet(other)))

    assert.equal(result.references[0].linked_purchase_row, null)
    assert.equal(validation(result).linked_foreign_references, 0)
    assert.equal(result.status, 'needs_review')
  })

  it('외화 구성 금액이 맞지 않으면 미완료이다', () => {
    const bad = [...FOREIGN]
    bad[10] = 5
    const result = parse(withSheet('해외이용', foreignSheet(bad)))

    assert.equal(validation(result).foreign_components_match, false)
    assert.equal(result.status, 'needs_review')
  })

  it('취소 내역은 참고로만 남기고 거래에 반영하지 않는다', () => {
    const result = parse()
    const cancellation = result.references[1]

    assert.equal(cancellation.kind, 'cancellation_reference')
    assert.equal(cancellation.amount_krw, -10)
    assert.equal(cancellation.posting_status, 'requires_linkage')
    assert.equal(cancellation.transaction_date, '2026-09-29')
    assert.equal(validation(result).cancellation_reference_count, 1)
    assert.equal(
      result.transactions.reduce((sum, row) => sum + (row.billed_amount_krw ?? 0), 0),
      280,
    )
  })

  it('명세서 화면의 건수와 다르면 미완료이고 구간별로 표시한다', () => {
    const result = parse(sheetsFixture(), {
      ...REFERENCE,
      validation: { ...REFERENCE.validation, sections: { ...REFERENCE.validation.sections, D0: { declared_count: 3 } } },
    })

    assert.equal(validation(result).source_counts_match, false)
    assert.equal(validation(result).sections.D0.count_matches, false)
    assert.equal(validation(result).sections.D0.expected_count_from_html, 3)
    assert.equal(validation(result).sections.D1.count_matches, true)
    assert.equal(result.status, 'needs_review')
  })

  it('화면에서 확인한 거래가 내보내기에 없으면 미완료이다', () => {
    const result = parse(sheetsFixture(), {
      ...REFERENCE,
      transactions: [
        ...REFERENCE.transactions,
        { transaction_date: '2026-09-09', merchant: '없는상점', original_amount: 5, billed_amount_krw: 5 },
      ],
    })

    assert.equal(validation(result).comparison_excerpt_matches, false)
    assert.equal(result.status, 'needs_review')
  })

  it('같은 거래가 화면에 더 많이 있으면 부족한 만큼 미완료이다', () => {
    const result = parse(sheetsFixture(), {
      ...REFERENCE,
      transactions: [...REFERENCE.transactions, REFERENCE.transactions[0]],
    })

    assert.equal(validation(result).comparison_excerpt_matches, false)
  })

  it('청구 조정 항목을 반영한 총 결제액이 맞으면 완료이다', () => {
    const result = parse(sheetsFixture(), {
      ...REFERENCE,
      validation: {
        ...REFERENCE.validation,
        declared_summary_krw: { 일시불: 180, 할부: 100, 미리입금하신금액: -10, 없는값: null },
        declared_grand_total_krw: 270,
      },
    })

    assert.equal(validation(result).statement_total_matches, true)
    assert.equal(result.status, 'parsed')
  })

  it('총 결제액이 다르면 미완료이다', () => {
    const result = parse(sheetsFixture(), {
      ...REFERENCE,
      validation: { ...REFERENCE.validation, declared_grand_total_krw: 281 },
    })

    assert.equal(validation(result).statement_total_matches, false)
    assert.equal(result.status, 'needs_review')
  })

  it('카드별 요약 합계가 구매 합계와 다르면 미완료이다', () => {
    const sheets = withSheet('청구요약', [['청구요약'], [], ['이용자', '카드번호/대출번호', '상품명', '원금', '이자/수수료'], ['본인', 'M', '카드', 281, 0]])
    const result = parse(sheets)

    assert.equal(validation(result).card_summary_matches, false)
    assert.equal(result.status, 'needs_review')
  })

  it('경고에는 외화·취소 연결 안내가 항상 들어간다', () => {
    assert.match(parse().warnings.at(-1) ?? '', /cancellations need linkage/)
  })

  it('모든 행이 후보 상태이고 출처 정보를 붙이면 행 ID가 결정적이다', () => {
    const raw = Buffer.from('xlsx-bytes')
    const first = attachSource(parse(), 'samsung', raw, raw, 'samsung_xlsx_export')
    const second = attachSource(parse(), 'samsung', raw, raw, 'samsung_xlsx_export')

    assert.ok(first.transactions.every((row) => row.posting_status === 'candidate'))
    assert.deepEqual(
      first.transactions.map((row) => row.source_row_id),
      second.transactions.map((row) => row.source_row_id),
    )
    assert.equal(new Set(first.transactions.map((row) => row.source_row_id)).size, 3)
  })
})

describe('parseSamsungXlsx', () => {
  it('XLSX 파일부터 파싱까지 한 번에 수행한다', async () => {
    const result = await parseSamsungXlsx(await xlsxFromSheets(sheetsFixture()), REFERENCE)

    assert.equal(result.status, 'parsed')
    assert.equal(result.transactions.length, 3)
    assert.equal(result.transactions[0].billed_amount_krw, 90)
    assert.equal(result.references.length, 2)
  })

  it('XLSX가 아닌 데이터는 거부한다', async () => {
    await assert.rejects(parseSamsungXlsx(Buffer.from('<html>login</html>'), REFERENCE), /Invalid XLSX archive/)
  })
})
