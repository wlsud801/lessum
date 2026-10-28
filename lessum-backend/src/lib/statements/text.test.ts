import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { StatementFormatError } from './errors.js'
import { amount, clean, decodeHtml, parseDate } from './text.js'

const CONTEXT = { payment_date: '2026-01-14' }

describe('clean', () => {
  it('공백을 하나로 줄이고 HTML 엔티티를 풀어준다', () => {
    assert.equal(clean('  가맹점 \n\t 이름&amp;co&nbsp;지점  '), '가맹점 이름&co 지점')
  })

  it('파이썬이 공백으로 보는 문자를 모두 공백으로 취급한다', () => {
    assert.equal(clean('a\u3000b\u2003c\x1fd\x85e\u00a0f'), 'a b c d e f')
  })

  it('빈 문자열은 빈 문자열이다', () => {
    assert.equal(clean('  \n '), '')
  })
})

describe('amount', () => {
  it('쉼표, 원, 유니코드 마이너스를 처리한다', () => {
    assert.equal(amount('1,234,567'), 1234567)
    assert.equal(amount('12,000원'), 12000)
    assert.equal(amount(' 500 원 '), 500)
    assert.equal(amount('−3,000'), -3000)
    assert.equal(amount('-10'), -10)
    assert.equal(amount('0'), 0)
  })

  it('비어 있거나 대시뿐이면 null이다 (0으로 바꾸지 않는다)', () => {
    for (const value of ['', '  ', '-', '—']) {
      assert.equal(amount(value), null)
    }
  })

  it('금액이 아닌 값은 0으로 만들지 않고 거부한다', () => {
    for (const value of ['1.5', 'abc', '1,2,3x', '--5', '1 000', '１２３']) {
      assert.throws(() => amount(value), StatementFormatError)
    }
  })

  it('안전한 정수 범위를 벗어나면 거부한다', () => {
    assert.throws(() => amount('99999999999999999999'), StatementFormatError)
  })
})

describe('parseDate', () => {
  it('8자리, 6자리, 구분자 날짜는 명시적 날짜다', () => {
    assert.deepEqual(parseDate('20261012', CONTEXT), { date: '2026-10-12', basis: 'explicit' })
    assert.deepEqual(parseDate('261012', CONTEXT), { date: '2026-10-12', basis: 'explicit' })
    assert.deepEqual(parseDate('26.10.12', CONTEXT), { date: '2026-10-12', basis: 'explicit' })
    assert.deepEqual(parseDate('2026-10-12', CONTEXT), { date: '2026-10-12', basis: 'explicit' })
    assert.deepEqual(parseDate('26. 9. 2', CONTEXT), { date: '2026-09-02', basis: 'explicit' })
    assert.deepEqual(parseDate('2026 / 1 / 5', CONTEXT), { date: '2026-01-05', basis: 'explicit' })
  })

  it('월일만 있으면 결제일 기준으로 연도를 추정하고 표시한다', () => {
    assert.deepEqual(parseDate('12.20', CONTEXT), {
      date: '2025-12-20',
      basis: 'inferred_from_payment_date',
    })
    assert.deepEqual(parseDate('01/05', CONTEXT), {
      date: '2026-01-05',
      basis: 'inferred_from_payment_date',
    })
    assert.deepEqual(parseDate('1-14', CONTEXT), {
      date: '2026-01-14',
      basis: 'inferred_from_payment_date',
    })
  })

  it('존재하지 않는 날짜는 거부한다', () => {
    for (const value of ['20261340', '2026.02.30', '261301', '02.30', '13.01']) {
      assert.throws(() => parseDate(value, CONTEXT), StatementFormatError)
    }
  })

  it('결제일이 없으면 월일만 있는 날짜를 추정하지 않는다', () => {
    assert.throws(() => parseDate('12.20', {}), /payment date unavailable/)
    assert.throws(() => parseDate('12.20', { payment_date: null }), StatementFormatError)
  })

  it('알 수 없는 형식은 거부한다', () => {
    for (const value of ['', 'abc', '2026', '12', '12.20.30.40']) {
      assert.throws(() => parseDate(value, CONTEXT), StatementFormatError)
    }
  })

  it('윤년이 아닌 해의 2월 29일은 거부한다', () => {
    assert.throws(() => parseDate('02.29', { payment_date: '2026-03-10' }), StatementFormatError)
    assert.deepEqual(parseDate('02.29', { payment_date: '2028-03-10' }), {
      date: '2028-02-29',
      basis: 'inferred_from_payment_date',
    })
  })
})

describe('decodeHtml', () => {
  const euckr = Buffer.from('c7d1b1db', 'hex')

  it('UTF-8을 우선 해석한다', () => {
    assert.equal(decodeHtml(Buffer.from('<p>한글</p>'), null), '<p>한글</p>')
  })

  it('MIME charset을 우선 사용한다', () => {
    assert.equal(decodeHtml(euckr, 'euc-kr'), '한글')
  })

  it('MIME charset이 없으면 HTML meta의 charset을 사용한다', () => {
    const data = Buffer.concat([Buffer.from('<meta charset="euc-kr">'), euckr])

    assert.equal(decodeHtml(data, null), '<meta charset="euc-kr">한글')
  })

  it('UTF-8이 아니면 CP949로 되돌아간다', () => {
    assert.equal(decodeHtml(euckr, null), '한글')
  })

  it('파이썬식 한글 charset 별칭(cp949 등)을 인식한다', () => {
    for (const charset of ['cp949', 'CP949', 'ms949', 'uhc', 'x-windows-949', 'ks_c_5601-1987']) {
      assert.equal(decodeHtml(euckr, charset), '한글')
    }
  })

  it('알 수 없는 charset 이름은 건너뛴다', () => {
    assert.equal(decodeHtml(Buffer.from('한글'), 'no-such-charset'), '한글')
  })

  it('어떤 인코딩으로도 읽을 수 없으면 거부한다', () => {
    assert.throws(() => decodeHtml(Buffer.from([0xff, 0xff, 0xff]), null), /Unknown HTML encoding/)
  })

  it('BOM을 지우지 않는다', () => {
    assert.equal(decodeHtml(Buffer.from('\ufeffabc'), null), '\ufeffabc')
  })
})
