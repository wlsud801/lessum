import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { describe, it } from 'node:test'

import { decryptSecret, encryptSecret, parseEncryptionKey } from './crypto.js'

const key = randomBytes(32)
const context = 'user-1:mail-app-password'

describe('encryptSecret / decryptSecret', () => {
  it('암호화한 값을 같은 키와 컨텍스트로 복호화한다', () => {
    const payload = encryptSecret(key, 'abcd efgh ijkl', context)

    assert.equal(decryptSecret(key, payload, context), 'abcd efgh ijkl')
  })

  it('한글과 특수문자도 그대로 복원한다', () => {
    const payload = encryptSecret(key, '암호!@#한글🔒', context)

    assert.equal(decryptSecret(key, payload, context), '암호!@#한글🔒')
  })

  it('같은 평문이어도 매번 다른 암호문을 만든다', () => {
    assert.notEqual(
      encryptSecret(key, 'same', context),
      encryptSecret(key, 'same', context),
    )
  })

  it('암호문에 평문이 드러나지 않는다', () => {
    const payload = encryptSecret(key, 'plain-secret-value', context)

    assert.ok(!payload.includes('plain-secret-value'))
  })

  it('다른 키로는 복호화하지 못한다', () => {
    const payload = encryptSecret(key, 'secret', context)

    assert.throws(() => decryptSecret(randomBytes(32), payload, context))
  })

  it('다른 컨텍스트로는 복호화하지 못한다', () => {
    const payload = encryptSecret(key, 'secret', context)

    assert.throws(() => decryptSecret(key, payload, 'user-2:mail-app-password'))
  })

  it('변조된 암호문은 복호화하지 못한다', () => {
    const [version, iv, tag, encrypted] = encryptSecret(
      key,
      'secret',
      context,
    ).split('.')
    const tampered = Buffer.from(encrypted, 'base64url')
    tampered[0] ^= 1

    assert.throws(() =>
      decryptSecret(
        key,
        [version, iv, tag, tampered.toString('base64url')].join('.'),
        context,
      ),
    )
  })

  it('지원하지 않는 형식은 거부한다', () => {
    assert.throws(() => decryptSecret(key, 'v2.a.b.c', context))
    assert.throws(() => decryptSecret(key, 'not-a-payload', context))
    assert.throws(() => decryptSecret(key, 'v1.a.b.c.d', context))
  })
})

describe('parseEncryptionKey', () => {
  it('32바이트 base64 키를 받아들인다', () => {
    const encoded = randomBytes(32).toString('base64')

    assert.equal(parseEncryptionKey(encoded).length, 32)
  })

  it('길이가 맞지 않으면 거부한다', () => {
    assert.throws(() => parseEncryptionKey(randomBytes(16).toString('base64')))
    assert.throws(() => parseEncryptionKey(''))
  })
})
