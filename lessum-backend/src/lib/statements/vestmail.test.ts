import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { StatementFormatError } from './errors.js'
import { encryptVestmail } from './test-support.js'
import { decryptVestmail } from './vestmail.js'

const PLAIN = `<!DOCTYPE html><html><body>한글${'내용'.repeat(200)}</body></html>`

function expectFormatError(run: () => unknown, message?: RegExp) {
  assert.throws(
    run,
    (error: unknown) =>
      error instanceof StatementFormatError &&
      (message === undefined || message.test(error.message)),
  )
}

describe('decryptVestmail', () => {
  it('여러 조각으로 나뉜 암호문을 복호화한다', () => {
    const encrypted = encryptVestmail(PLAIN)

    assert.ok((encrypted.match(/s\[\d+\]=/g) ?? []).length > 3)
    assert.equal(decryptVestmail(encrypted, 'test-only'), PLAIN)
  })

  it('조각 크기와 무관하게 같은 결과를 만든다', () => {
    for (const chunkSize of [1, 16, 95, 96, 97, 4096]) {
      assert.equal(
        decryptVestmail(encryptVestmail(PLAIN, 'test-only', chunkSize), 'test-only'),
        PLAIN,
      )
    }
  })

  it('한글 비밀번호도 처리한다', () => {
    assert.equal(
      decryptVestmail(encryptVestmail(PLAIN, '암호123!'), '암호123!'),
      PLAIN,
    )
  })

  it('비밀번호가 틀리면 거부한다', () => {
    expectFormatError(
      () => decryptVestmail(encryptVestmail(PLAIN), 'incorrect'),
      /Password incorrect/,
    )
  })

  it('조각 순서가 바뀌거나 번호가 어긋나면 거부한다', () => {
    const reordered = encryptVestmail('<!DOCTYPE html>' + 'a'.repeat(200)).replace(
      's[0]',
      's[9]',
    )

    expectFormatError(() => decryptVestmail(reordered, 'test-only'), /chunks/)
  })

  it('조각이 중복되면 거부한다', () => {
    const encrypted = encryptVestmail(PLAIN)
    const first = /s\[0\]="[^"]+";/.exec(encrypted)![0]

    expectFormatError(
      () => decryptVestmail(encrypted + first, 'test-only'),
      /chunks/,
    )
  })

  it('조각이 하나도 없으면 거부한다', () => {
    expectFormatError(
      () => decryptVestmail('VestMail window.x.s2=x.oa eval(atob(b_p))', 'x'),
      /chunks/,
    )
  })

  it('알려진 템플릿 표식이 없으면 거부한다', () => {
    for (const marker of ['VestMail', 'window.x.s2=x.oa', 'eval(atob(b_p))']) {
      expectFormatError(
        () => decryptVestmail(encryptVestmail(PLAIN).replace(marker, 'X'), 'test-only'),
        /Unrecognized/,
      )
    }
  })

  it('손상된 base64나 너무 짧은 조각은 거부한다', () => {
    const encrypted = encryptVestmail(PLAIN)

    expectFormatError(
      () => decryptVestmail(encrypted.replace(/s\[0\]="[^"]{20}/, 's[0]="@@@@'), 'test-only'),
    )
    expectFormatError(
      () => decryptVestmail('VestMail window.x.s2=x.oa eval(atob(b_p)) s[0]="QUJD";', 'test-only'),
      /Password incorrect/,
    )
  })

  it('암호문 한 바이트가 바뀌면 거부한다', () => {
    const encrypted = encryptVestmail(PLAIN)
    const tampered = encrypted.replace(/(s\[0\]="[A-Za-z0-9+/]{60})([A-Za-z0-9+/])/, (_m, head, char) =>
      head + (char === 'A' ? 'B' : 'A'),
    )

    expectFormatError(() => decryptVestmail(tampered, 'test-only'))
  })

  it('복호화 결과가 HTML이 아니면 거부한다', () => {
    expectFormatError(
      () => decryptVestmail(encryptVestmail('plain text, not html'), 'test-only'),
      /not supported HTML/,
    )
  })

  it('복호화 결과가 UTF-8이 아니면 거부한다', () => {
    const invalid = Buffer.concat([Buffer.from('<html>'), Buffer.from([0xff, 0xfe, 0xfd])])

    expectFormatError(
      () => decryptVestmail(encryptVestmail(invalid), 'test-only'),
      /Password incorrect/,
    )
  })
})
