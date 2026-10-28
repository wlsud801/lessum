import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseAttachment, parseEmail } from './email.js'
import { StatementFormatError } from './errors.js'
import { buildEmail, hyundaiFixture } from './fixtures.js'
import {
  hyundaiData,
  jsArguments,
  jsString,
  literalValue,
  parseHyundai,
} from './hyundai.js'
import { encryptVestmail } from './test-support.js'

function expectFormatError(run: () => unknown, message?: RegExp) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof StatementFormatError &&
      (message === undefined || message.test(error.message)),
  )
}

const row = (fields: string, label = '카드') =>
  `arUseDesc[loop++] = new UseDesc(loop,${fields.replace('LABEL', `gf_Convert2ByteChar2('${label}')`)});`

describe('jsArguments', () => {
  it('따옴표 안의 쉼표와 괄호는 분리하지 않는다', () => {
    assert.deepEqual(
      jsArguments(`loop,'a,b',gf_Convert2ByteChar2('x(y),z'),'(',  3`),
      ['loop', "'a,b'", "gf_Convert2ByteChar2('x(y),z')", "'('", '3'],
    )
  })

  it('이스케이프된 따옴표를 문자열 끝으로 보지 않는다', () => {
    assert.deepEqual(jsArguments(`'it\\'s, ok','b'`), [`'it\\'s, ok'`, "'b'"])
    assert.deepEqual(jsArguments(`"say \\"hi\\", ok","b"`), [`"say \\"hi\\", ok"`, '"b"'])
  })

  it('균형이 맞지 않으면 거부한다', () => {
    expectFormatError(() => jsArguments("a,'unterminated"), /Unbalanced/)
    expectFormatError(() => jsArguments('f(a,b'), /Unbalanced/)
    expectFormatError(() => jsArguments('a),b'), /Unbalanced/)
  })
})

describe('jsString', () => {
  it('이스케이프 시퀀스를 해석한다', () => {
    assert.equal(jsString(`'a\\nb\\tc\\\\d\\'e\\"f\\/g'`), 'a\nb\tc\\d\'e"f/g')
    assert.equal(jsString(`"\\u0041\\x42\\uD55C"`), 'AB한')
  })

  it('알 수 없는 이스케이프는 문자 그대로 둔다', () => {
    assert.equal(jsString(`'a\\qb'`), 'aqb')
  })

  it('문자열 리터럴이 아니면 거부한다', () => {
    for (const value of ['abc', "'abc", `'abc"`, "'", '', '123']) {
      expectFormatError(() => jsString(value), /string literal/)
    }
  })
})

describe('literalValue', () => {
  it('일반 문자열은 정리만 한다', () => {
    assert.equal(literalValue("'  1,000  '"), '1,000')
  })

  it('gf_Convert2ByteChar2 안의 전각 문자를 반각으로 바꾼다', () => {
    assert.equal(literalValue("gf_Convert2ByteChar2('ＡＢＣ１２３（주）')"), 'ABC123(주)')
  })

  it('전각 공백과 따옴표, 물결, 원화 기호를 변환한다', () => {
    assert.equal(
      literalValue("gf_Convert2ByteChar2('a\u3000b\u2019c\u201dd\uffe3e\uffe5f')"),
      `a b'c"d~e\\f`,
    )
  })

  it('전각 역슬래시(U+FF3C)는 변환하지 않는다', () => {
    assert.equal(literalValue("gf_Convert2ByteChar2('a\uff3cb')"), 'a\uff3cb')
  })

  it('래퍼가 없으면 전각 문자를 변환하지 않는다', () => {
    assert.equal(literalValue("'ＡＢ'"), 'ＡＢ')
  })
})

describe('hyundaiData', () => {
  it('생성자 인자를 모두 읽고 쉼표·괄호가 든 가맹점명을 보존한다', () => {
    const data = hyundaiData(hyundaiFixture())

    assert.equal(data.length, 3)
    assert.equal(data[0][4], '상점(주),지점')
    assert.equal(data[0][5], '1,000')
  })

  it('배열 길이 선언이 실제 개수와 다르면 거부한다 (원본 Python 테스트)', () => {
    expectFormatError(() => hyundaiData(hyundaiFixture({ arrayLength: 4 })), /length mismatch/)
  })

  it('생성자 인자 수나 첫 인자가 바뀌면 거부한다', () => {
    expectFormatError(
      () => hyundaiData(hyundaiFixture().replace("'110113');", ');').replace(",'N',)", ",'N')")),
      /schema changed/,
    )
    expectFormatError(
      () => hyundaiData(hyundaiFixture().replace('new UseDesc(loop,', 'new UseDesc(idx,')),
      /schema changed/,
    )
  })

  it('거래 데이터가 없으면 거부한다', () => {
    expectFormatError(() => hyundaiData('<script>var x = 1</script>'), /data missing/)
  })
})

describe('parseHyundai', () => {
  it('정상 명세서는 parsed이고 구매 건수까지 검증한다 (원본 Python 테스트)', () => {
    const result = parseHyundai(hyundaiFixture())

    assert.equal(result.status, 'parsed')
    assert.equal(result.transactions.length, 2)
    assert.equal(result.transactions[0].merchant, '상점(주),지점')
    assert.equal(result.validation?.purchase_count_matches, true)
    assert.equal(result.validation?.purchase_row_count, 2)
    assert.equal(result.validation?.declared_purchase_count, 2)
    assert.deepEqual(result.context, { payment_date: '2026-10-12', statement_month: '2026-10' })
  })

  it('행 필드가 올바르게 채워지고 연도는 결제일 기준으로 추정한다', () => {
    const first = parseHyundai(hyundaiFixture()).transactions[0]

    assert.equal(first.issuer, 'hyundai')
    assert.equal(first.source_row, 'arUseDesc:0')
    assert.equal(first.raw_date, '260901')
    assert.equal(first.transaction_date, '2026-09-01')
    assert.equal(first.date_basis, 'explicit')
    assert.equal(first.original_amount, 1000)
    assert.equal(first.billed_principal_krw, 1000)
    assert.equal(first.fee_krw, 10)
    assert.equal(first.card_label, '카드')
    assert.equal(first.installment_months, null)
    assert.equal(first.installment_round, null)
    assert.equal(first.kind, 'purchase_candidate')
  })

  it('할부 개월과 회차를 읽고, 0은 null로 둔다', () => {
    const html = hyundaiFixture({
      arrayLength: 4,
      extraRows: row("'260902','본인',LABEL,gf_Convert2ByteChar2('할부상점'),'3,000','3','2','1,000','0','0','','0','0','N','110113'"),
      declaredCount: 3,
    }).replace("'2,000','10'", "'3,000','10'")
    const rows = parseHyundai(html).transactions

    assert.equal(rows[2].installment_months, 3)
    assert.equal(rows[2].installment_round, 2)
    assert.equal(rows[0].installment_months, null)
  })

  it('원금과 청구액이 모두 0이면 조정 참고 행으로 분류하고 구매 건수에서 뺀다', () => {
    const html = hyundaiFixture({
      arrayLength: 4,
      extraRows: row("'260903','본인',LABEL,gf_Convert2ByteChar2('포인트조정'),'0','0','0','0','0','0','','0','0','N','110113'"),
    })
    const result = parseHyundai(html)

    assert.equal(result.transactions[2].kind, 'adjustment_reference')
    assert.equal(result.validation?.purchase_row_count, 2)
    assert.equal(result.validation?.row_count, 3)
    assert.equal(result.status, 'parsed')
  })

  it('청구 원금이나 수수료 합계가 맞지 않으면 needs_review이다', () => {
    assert.equal(
      parseHyundai(hyundaiFixture().replace("'2,000','10'", "'2,001','10'")).status,
      'needs_review',
    )
    assert.equal(
      parseHyundai(hyundaiFixture().replace("'2,000','10'", "'2,000','11'")).status,
      'needs_review',
    )
  })

  it('선언된 구매 건수가 실제와 다르면 needs_review이다', () => {
    const result = parseHyundai(hyundaiFixture({ declaredCount: 3 }))

    assert.equal(result.status, 'needs_review')
    assert.equal(result.validation?.purchase_count_matches, false)
  })

  it('날짜 형식이 6자리가 아니면 거부한다', () => {
    expectFormatError(
      () => parseHyundai(hyundaiFixture().replace("'260901','본인'", "'2026-09-01','본인'")),
      /dated row not recognized/,
    )
  })

  it('금액이 아닌 값은 0으로 만들지 않고 거부한다', () => {
    expectFormatError(() => parseHyundai(hyundaiFixture().replace("'1,000','0','0','1,000','10'", "'1,0x0','0','0','1,000','10'")), /monetary/)
  })

  it('취소 내역 표를 참고 내역으로 보존하고 청구 합계에 더하지 않는다', () => {
    const tables = `<table><tr><th>취소일</th><th>이용일</th><th>취소금액</th></tr>
      <tr><td>2026.10.01</td><td>2026.09.20</td><td></td><td>취소상점</td><td>-500</td><td></td></tr>
      <tr><td>합계</td><td>-800</td></tr></table>`
    const result = parseHyundai(hyundaiFixture({ tables }))

    assert.equal(result.status, 'parsed')
    assert.equal(result.references.length, 1)
    assert.deepEqual(result.references[0], {
      kind: 'cancellation_reference',
      cancel_date: '2026.10.01',
      original_date: '2026.09.20',
      merchant: '취소상점',
      amount_krw: -500,
      posting_status: 'requires_linkage',
    })
    assert.equal(result.validation?.parsed_billed_principal_krw, 2000)
  })

  it('11칸 형식은 홀수 번째 칸이 모두 빈 경우에만 6칸으로 접어 읽는다', () => {
    const tables = `<table><tr><th>취소일</th><th>취소금액</th></tr>
      <tr><td>2026.10.05</td><td></td><td>2026.09.30</td><td></td><td>x</td><td></td><td>취소가맹</td><td></td><td>-700</td><td></td><td>z</td></tr>
      <tr><td>2026.10.06</td><td>값있음</td><td>2026.09.30</td><td></td><td>x</td><td></td><td>제외</td><td></td><td>-1</td><td></td><td>z</td></tr></table>`
    const references = parseHyundai(hyundaiFixture({ tables })).references

    assert.equal(references.length, 1)
    assert.equal(references[0].cancel_date, '2026.10.05')
    assert.equal(references[0].original_date, '2026.09.30')
    assert.equal(references[0].merchant, '취소가맹')
    assert.equal(references[0].amount_krw, -700)
  })

  it('항상 외화·취소 연결 경고를 남긴다', () => {
    assert.match(parseHyundai(hyundaiFixture()).warnings[0], /cancellations need original-transaction linkage/)
  })

  it('스크립트 안의 날짜 문구를 결제일로 오인하지 않는다', () => {
    const html = hyundaiFixture().replace('<script>', '<script>var d = "결제일 2024년 1월 1일";')

    assert.equal(parseHyundai(html).context?.payment_date, '2026-10-12')
  })

  it('결제일이 없으면 거부한다', () => {
    expectFormatError(() => parseHyundai(hyundaiFixture().replace('결제일 : 2026년 10월 12일', '')), /payment date/)
  })

  it('거래 행이 하나도 없으면 거부한다', () => {
    const html = hyundaiFixture({ arrayLength: 1 }).replace(/arUseDesc\[loop\+\+\] = new UseDesc\(loop,'2609[\s\S]*?\);/g, '')

    expectFormatError(() => parseHyundai(html), /No verified transaction rows/)
  })
})

describe('현대카드 암호화 첨부', () => {
  it('비밀번호 없이는 password_required, 있으면 복호화 후 파싱한다', async () => {
    const encrypted = encryptVestmail(hyundaiFixture(), 'hyundai-pw')
    const data = buildEmail([{ filename: 'hyundai.html', content: encrypted }])

    assert.equal(parseAttachment('hyundai', encrypted).status, 'password_required')

    const result = await parseEmail(data, 'hyundai', 'hyundai-pw')
    assert.equal(result.status, 'parsed')
    assert.equal(result.issuer, 'hyundai')
    assert.equal(result.transactions.length, 2)
    assert.ok(result.transactions.every((r) => r.source_row_id))
  })
})
