import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import ExcelJS from 'exceljs'

import {
  CANCEL_SHEET,
  FOREIGN_HEADERS,
  PURCHASE_HEADERS,
  SamsungExportError,
  integer,
  loadWorkbookRows,
  parseExportSheets,
  readExport,
  text,
  type SheetRows,
} from './samsung-export.js'
import {
  BENEFIT,
  CANCEL,
  FOREIGN,
  INSTALLMENT,
  ONE,
  SUMMARY_HEADERS,
  sheetsFixture,
  totalRow,
  xlsxFromSheets,
} from './samsung-fixtures.js'
import { buildZip } from './test-support.js'

function expectExportError(run: () => unknown, message: RegExp) {
  assert.throws(
    run,
    (error: unknown) => error instanceof SamsungExportError && message.test(error.message),
  )
}

const withSheet = (name: string, rows: SheetRows[string]) => ({ ...sheetsFixture(), [name]: rows })
const purchaseSheet = (name: string, body: SheetRows[string][number][]) => [
  [name],
  [],
  [...PURCHASE_HEADERS],
  ...body,
]

describe('text / integer', () => {
  it('text는 공백을 정리하고 빈 값은 빈 문자열이다', () => {
    assert.equal(text(null), '')
    assert.equal(text(undefined), '')
    assert.equal(text('  a \n b  '), 'a b')
    assert.equal(text(12), '12')
  })

  it('text는 HTML 엔티티를 풀지 않는다 (파이썬과 동일)', () => {
    assert.equal(text('A&amp;B'), 'A&amp;B')
  })

  it('integer는 쉼표, 문자열, 정수형 실수를 처리한다', () => {
    assert.equal(integer('1,234'), 1234)
    assert.equal(integer(1234), 1234)
    assert.equal(integer('100.0'), 100)
    assert.equal(integer(-5), -5)
    assert.equal(integer('+7'), 7)
    assert.equal(integer(''), null)
    assert.equal(integer(null), null)
    assert.equal(integer('0'), 0)
  })

  it('integer는 필수인데 비어 있으면 거부한다', () => {
    expectExportError(() => integer('', true), /Required monetary cell is blank/)
    expectExportError(() => integer(null, true), /Required monetary cell is blank/)
  })

  it('integer는 정수가 아니거나 숫자가 아니면 거부한다', () => {
    expectExportError(() => integer('1.5'), /integer KRW amount/)
    expectExportError(() => integer('abc'), /Unsupported numeric cell/)
    expectExportError(() => integer('1e3'), /Unsupported numeric cell/)
    expectExportError(() => integer('12 000'), /Unsupported numeric cell/)
    expectExportError(() => integer('99999999999999999999'), /integer KRW amount/)
  })
})

describe('parseExportSheets', () => {
  it('정상 시트를 읽어 구매·참고 내역·구간 합계를 만든다', () => {
    const result = parseExportSheets(sheetsFixture())

    assert.equal(result.purchases.length, 3)
    assert.deepEqual(
      result.purchases.map((p) => [p.source_row, p.section]),
      [['일시불:4', 'D0'], ['일시불:6', 'D0'], ['할부:4', 'D1']],
    )
    assert.equal(result.sections.D0.row_count, 2)
    assert.equal(result.sections.D0.benefit_continuation_rows, 2)
    assert.equal(result.sections.D0.billed_principal_krw, 180)
    assert.equal(result.sections.D0.declared_principal_krw, 180)
    assert.equal(result.sections.D0.amount_matches, true)
    assert.equal(result.sections.D1.amount_matches, true)
    assert.equal(result.sections.DE.row_count, 1)
    assert.equal(result.sections.DE.amount_matches, true)
    assert.equal(result.card_summary_total_krw, 280)
    assert.equal(result.card_summary_matches, true)
    assert.deepEqual(
      result.references.map((r) => [r.kind, r.source_row, r.amount_krw]),
      [['foreign_detail_reference', 'DE:4', 100], ['cancellation_reference', 'DF:4', -10]],
    )
  })

  it('혜택 행은 구매가 아니라 앞 구매에 붙고, 같은 구매 두 건은 모두 남는다', () => {
    const result = parseExportSheets(sheetsFixture())

    assert.deepEqual(
      result.purchases[0].benefits.map((b) => [b.label, b.amount_krw]),
      [['청구할인', -5], ['해외수수료할인', -5]],
    )
    assert.equal(result.purchases[0].billed_amount_krw, 90)
    assert.equal(result.purchases[1].merchant, result.purchases[0].merchant)
  })

  it('혜택 행이 구매 앞에 홀로 있으면 거부한다 (원본 Python 테스트)', () => {
    expectExportError(() => parseExportSheets(sheetsFixture({ orphan: true })), /Unlinked or monetary continuation row/)
  })

  it('구간 합계가 맞지 않으면 amount_matches가 false이다', () => {
    const result = parseExportSheets(sheetsFixture({ footer: 181 }))

    assert.equal(result.sections.D0.amount_matches, false)
    assert.equal(result.sections.D0.declared_principal_krw, 181)
  })

  it('합계 행이 없으면 declared가 null이고 amount_matches가 false이다', () => {
    const rows = purchaseSheet('할부', [INSTALLMENT])
    const result = parseExportSheets(withSheet('할부', rows))

    assert.equal(result.sections.D1.declared_principal_krw, null)
    assert.equal(result.sections.D1.amount_matches, false)
  })

  it('시트 구성이 바뀌면 거부한다', () => {
    const { 청구요약: _omitted, ...missing } = sheetsFixture()

    expectExportError(() => parseExportSheets(missing), /sheet schema changed/)
    expectExportError(() => parseExportSheets({ ...sheetsFixture(), 추가시트: [] }), /sheet schema changed/)
  })

  it('행이 10000개를 넘거나 열이 20개를 넘으면 거부한다', () => {
    expectExportError(
      () => parseExportSheets(withSheet('청구요약', Array.from({ length: 10001 }, () => []))),
      /exceeds parsing limits/,
    )
    const wide = sheetsFixture()
    wide['청구요약'][3] = [...wide['청구요약'][3], ...Array.from({ length: 20 }, () => null)]
    expectExportError(() => parseExportSheets(wide), /exceeds parsing limits/)
  })

  it('머리글이 바뀌면 시트별로 거부한다', () => {
    const bad = (row: unknown[]) => row.map((value, i) => (i === 0 ? `${value}X` : value))
    const base = sheetsFixture()

    expectExportError(() => parseExportSheets(withSheet('일시불', [base['일시불'][0], [], bad(base['일시불'][2]), ...base['일시불'].slice(3)])), /Purchase export columns changed/)
    expectExportError(() => parseExportSheets(withSheet('할부', [base['할부'][0], [], bad(base['할부'][2]), ...base['할부'].slice(3)])), /Purchase export columns changed/)
    expectExportError(() => parseExportSheets(withSheet('해외이용', [base['해외이용'][0], [], bad(base['해외이용'][2]), ...base['해외이용'].slice(3)])), /Foreign export columns changed/)
    expectExportError(() => parseExportSheets(withSheet(CANCEL_SHEET, [base[CANCEL_SHEET][0], [], bad(base[CANCEL_SHEET][2]), ...base[CANCEL_SHEET].slice(3)])), /Cancellation export columns changed/)
    expectExportError(() => parseExportSheets(withSheet('청구요약', [base['청구요약'][0], [], bad(base['청구요약'][2]), ...base['청구요약'].slice(3)])), /Card summary export columns changed/)
  })

  it('머리글 오른쪽의 빈 칸은 허용하지만 값이 있는 추가 열은 거부한다', () => {
    const tolerant = sheetsFixture()
    tolerant['일시불'][2] = [...PURCHASE_HEADERS, null, '']
    assert.doesNotThrow(() => parseExportSheets(tolerant))

    const extra = sheetsFixture()
    extra['일시불'][2] = [...PURCHASE_HEADERS, '새열']
    expectExportError(() => parseExportSheets(extra), /Purchase export columns changed/)
  })

  it('시트에 3행이 없으면 머리글 변경으로 본다', () => {
    expectExportError(() => parseExportSheets(withSheet('일시불', [['일시불']])), /columns changed/)
  })

  it('구간 합계 뒤에 구매가 나오면 거부한다', () => {
    const rows = purchaseSheet('일시불', [ONE, totalRow('일시불', 90), ONE])

    expectExportError(() => parseExportSheets(withSheet('일시불', rows)), /Purchase appears after section total/)
  })

  it('구간 합계가 두 번 나오면 거부한다', () => {
    const rows = purchaseSheet('일시불', [ONE, totalRow('일시불', 90), totalRow('일시불', 90)])

    expectExportError(() => parseExportSheets(withSheet('일시불', rows)), /Duplicate export total/)
  })

  it('날짜 형식이 8자리가 아닌 행은 거부한다', () => {
    const bad = [...ONE]
    bad[0] = '2026-09-02'

    expectExportError(() => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [bad]))), /Unrecognized dated export row/)
  })

  it('가맹점이 없는 구매는 거부한다', () => {
    const bad = [...ONE]
    bad[2] = ''

    expectExportError(() => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [bad]))), /Purchase merchant missing/)
  })

  it('원금·수수료·이용금액이 비어 있으면 거부한다', () => {
    for (const index of [3, 9, 10]) {
      const bad = [...ONE]
      bad[index] = ''

      expectExportError(() => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [bad]))), /Required monetary cell is blank/)
    }
  })

  it('값이 0뿐인 빈 날짜 행은 무시하고, 다른 값이 있으면 거부한다', () => {
    const zeros: unknown[] = ['', '', '', '', '', '', '', '', '', 0, '0.0', '', '0', 0]
    assert.doesNotThrow(() => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [ONE, zeros, totalRow('일시불', 90)]))))

    const stray = [...zeros]
    stray[11] = '포인트'
    expectExportError(
      () => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [ONE, stray, totalRow('일시불', 90)]))),
      /Unknown blank-date export row/,
    )
  })

  it('이어지는 혜택 행에 금액이 있으면 거부한다', () => {
    const monetary = [...BENEFIT]
    monetary[9] = 50

    expectExportError(
      () => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [ONE, monetary]))),
      /Unlinked or monetary continuation row/,
    )
  })

  it('합계 행 다음에 오는 혜택 행은 연결할 구매가 없어 거부한다', () => {
    expectExportError(
      () => parseExportSheets(withSheet('일시불', purchaseSheet('일시불', [ONE, totalRow('일시불', 90), BENEFIT]))),
      /Unlinked or monetary continuation row/,
    )
  })

  it('할부 개월·회차가 0이면 null로 읽는 것이 아니라 0 그대로 전달한다', () => {
    const zero = [...INSTALLMENT]
    zero[7] = '0'
    zero[8] = '0'
    const result = parseExportSheets(withSheet('할부', purchaseSheet('할부', [zero, totalRow('할부', 100)])))

    assert.equal(result.purchases.at(-1)?.installment_months, 0)
    assert.equal(result.purchases.at(-1)?.installment_round, 0)
  })

  it('해외 시트: 합계 뒤 거래, 합계 중복, 알 수 없는 행은 거부한다', () => {
    const total = ['', '', '해외매출합계', '', '', '', '', 1, '', 99, 1, 100]
    const sheet = (...body: unknown[][]) => [['해외이용'], [], [...FOREIGN_HEADERS], ...body]

    expectExportError(() => parseExportSheets(withSheet('해외이용', sheet(FOREIGN, total, FOREIGN))), /Foreign row appears after total/)
    expectExportError(() => parseExportSheets(withSheet('해외이용', sheet(FOREIGN, total, total))), /Duplicate foreign export total/)
    expectExportError(() => parseExportSheets(withSheet('해외이용', sheet(FOREIGN, ['x', '', 'y']))), /Unexpected foreign export row/)
    expectExportError(() => parseExportSheets(withSheet('해외이용', sheet(FOREIGN, []))), /Unexpected foreign export row/)
  })

  it('해외 시트: 구성 금액이 청구 금액과 다르면 components_match가 false이다', () => {
    const bad = [...FOREIGN]
    bad[10] = 5
    const result = parseExportSheets(withSheet('해외이용', [['해외이용'], [], [...FOREIGN_HEADERS], bad, ['', '', '해외매출합계', '', '', '', '', 1, '', 99, 1, 100]]))

    assert.equal(result.references[0].components_match, false)
  })

  it('해외 시트: 합계가 없거나 다르면 amount_matches가 false이다', () => {
    const noTotal = parseExportSheets(withSheet('해외이용', [['해외이용'], [], [...FOREIGN_HEADERS], FOREIGN]))
    assert.equal(noTotal.sections.DE.amount_matches, false)
    assert.equal(noTotal.sections.DE.declared_billed_amount_krw, null)

    const mismatch = parseExportSheets(withSheet('해외이용', [['해외이용'], [], [...FOREIGN_HEADERS], FOREIGN, ['', '', '해외매출합계', '', '', '', '', 1, '', 99, 1, 101]]))
    assert.equal(mismatch.sections.DE.amount_matches, false)
  })

  it('취소 시트: 날짜 형식이 틀리면 거부하고, 비어 있으면 참고 내역이 없다', () => {
    const bad = [...CANCEL]
    bad[0] = '2026.09.29'

    expectExportError(() => parseExportSheets(withSheet(CANCEL_SHEET, [[CANCEL_SHEET], [], ['이용일', '이용자', '이용가맹점', '상품명', '취소금액'], bad])), /Unexpected cancellation date/)

    const none = parseExportSheets(withSheet(CANCEL_SHEET, [[CANCEL_SHEET], [], ['이용일', '이용자', '이용가맹점', '상품명', '취소금액']]))
    assert.equal(none.references.filter((r) => r.kind === 'cancellation_reference').length, 0)
  })

  it('청구 요약: 비어 있는 금액은 거부하고, 합계가 구매와 다르면 card_summary_matches가 false이다', () => {
    expectExportError(
      () => parseExportSheets(withSheet('청구요약', [['청구요약'], [], [...SUMMARY_HEADERS], ['본인', 'M', '카드', '', 0]])),
      /Required monetary cell is blank/,
    )
    const result = parseExportSheets(withSheet('청구요약', [['청구요약'], [], [...SUMMARY_HEADERS], ['본인', 'M', '카드', 281, 0]]))
    assert.equal(result.card_summary_matches, false)
  })

  it('청구 요약이 여러 행이면 원금과 수수료를 모두 합산한다', () => {
    const result = parseExportSheets(
      withSheet('청구요약', [['청구요약'], [], [...SUMMARY_HEADERS], ['본인', 'M', '카드A', 200, 0], ['본인', 'M', '카드B', 70, 10]]),
    )

    assert.equal(result.card_summary_total_krw, 280)
    assert.equal(result.card_summary_matches, true)
  })
})

describe('loadWorkbookRows / readExport', () => {
  it('XLSX 파일을 읽어 시트별 행 배열로 만든다 (1행부터, 끝의 빈 행은 제외)', async () => {
    const rows = await loadWorkbookRows(await xlsxFromSheets(sheetsFixture()))

    assert.deepEqual(Object.keys(rows).sort(), Object.keys(sheetsFixture()).sort())
    assert.deepEqual(rows['일시불'][0].slice(0, 1), ['일시불'])
    assert.deepEqual(rows['일시불'][1].every((v) => v === null), true)
    assert.deepEqual(rows['일시불'][2].slice(0, 3), ['이용일', '이용구분', '가맹점'])
    assert.equal(rows['일시불'].length, 8)
    assert.equal(rows['일시불'][3][9], 90)
    assert.equal(rows['일시불'][3].length, 14)
  })

  it('끝의 빈 행은 버리고 중간의 빈 행은 보존한다', async () => {
    const sheets = sheetsFixture()
    sheets['청구요약'] = [['청구요약'], [], [...SUMMARY_HEADERS], ['본인', 'M', '카드', 280, 0], [], ['', 'x', '', '', ''], [], []]
    const rows = await loadWorkbookRows(await xlsxFromSheets(sheets))

    assert.equal(rows['청구요약'].length, 6)
    assert.equal(rows['청구요약'][4].every((v) => v === null), true)
  })

  it('수식 셀은 계산된 값, 서식 있는 텍스트는 이어 붙인 문자열로 읽는다', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('시트')
    sheet.getCell('A1').value = { formula: '1+2', result: 3 }
    sheet.getCell('B1').value = { richText: [{ text: '앞' }, { text: '뒤' }] }
    sheet.getCell('C1').value = { text: '링크', hyperlink: 'https://example.com' }
    sheet.getCell('D1').value = new Date('2026-09-02T00:00:00Z')
    const rows = await loadWorkbookRows(Buffer.from(await workbook.xlsx.writeBuffer()))

    assert.deepEqual(rows['시트'][0], [3, '앞뒤', '링크', '2026-09-02T00:00:00.000Z'])
  })

  it('XLSX가 아닌 데이터는 읽지 못한다', async () => {
    await assert.rejects(loadWorkbookRows(Buffer.from('not a workbook')), SamsungExportError)
  })

  it('시트가 없는 최소 워크북은 빈 결과이고, 해석 단계에서 거부된다', async () => {
    const minimal = buildZip([{ name: 'xl/workbook.xml', content: '<workbook/>' }])

    assert.deepEqual(await loadWorkbookRows(minimal), {})
    await assert.rejects(readExport(minimal), /sheet schema changed/)
  })

  it('readExport는 ZIP 검증, 읽기, 해석을 모두 수행한다', async () => {
    const result = await readExport(await xlsxFromSheets(sheetsFixture()))

    assert.equal(result.purchases.length, 3)
    assert.equal(result.card_summary_matches, true)
    assert.equal(result.sections.D0.amount_matches, true)
  })

  it('readExport는 ZIP이 아니거나 워크북이 아니면 읽기 전에 거부한다', async () => {
    await assert.rejects(readExport(Buffer.from('<html>login page</html>')), /Invalid XLSX archive/)
    await assert.rejects(
      readExport(buildZip([{ name: 'other.txt', content: 'x' }])),
      /not an XLSX workbook/,
    )
  })

  it('readExport는 시트 구성이 다른 워크북을 거부한다', async () => {
    const { 청구요약: _omitted, ...missing } = sheetsFixture()

    await assert.rejects(readExport(await xlsxFromSheets(missing)), /sheet schema changed/)
  })
})
