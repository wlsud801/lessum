import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { decodeImapUtf7 } from './imap-utf7.js'

function encodeImapUtf7(name: string): string {
  let output = ''
  let pending = ''
  const flush = () => {
    if (pending) {
      const encoded = Buffer.from(pending, 'utf16le')
        .swap16()
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\//g, ',')
      output += `&${encoded}-`
      pending = ''
    }
  }
  for (const char of name) {
    const code = char.codePointAt(0)!
    if (code >= 0x20 && code <= 0x7e) {
      flush()
      output += char === '&' ? '&-' : char
    } else {
      pending += char
    }
  }
  flush()
  return output
}

describe('decodeImapUtf7', () => {
  it('실제 네이버 서버가 돌려준 이름을 디코딩한다', () => {
    assert.equal(decodeImapUtf7('&zK2tbAC3rLDIHA-'), '청구·결제')
  })

  it('ASCII 이름은 그대로 둔다', () => {
    assert.equal(decodeImapUtf7('INBOX'), 'INBOX')
  })

  it('리터럴 앰퍼샌드를 복원한다', () => {
    assert.equal(decodeImapUtf7('A&-B'), 'A&B')
  })

  it('ASCII와 한글이 섞인 이름을 복원한다', () => {
    const names = ['카드 명세서/2026', 'Bills & 청구', '받은편지함', '😀 메일']
    for (const name of names) {
      assert.equal(decodeImapUtf7(encodeImapUtf7(name)), name)
    }
  })

  it('인코더와 디코더가 서로 맞는다', () => {
    assert.equal(encodeImapUtf7('청구·결제'), '&zK2tbAC3rLDIHA-')
  })

  it('불완전하거나 잘못된 인코딩은 거부한다', () => {
    assert.throws(() => decodeImapUtf7('&zK2tbAC3rLDIHA'))
    assert.throws(() => decodeImapUtf7('&!!!-'))
    assert.throws(() => decodeImapUtf7('&ab-'))
  })
})
