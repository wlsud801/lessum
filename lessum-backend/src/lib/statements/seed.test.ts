import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  seedCbcDecrypt,
  seedCbcEncrypt,
  seedDecryptBlock,
  seedEncryptBlock,
  seedKeySchedule,
} from './seed.js'
import { RFC_4269_VECTORS } from './seed-rfc-vectors.js'

const bytes = (hex: string) => new Uint8Array(Buffer.from(hex, 'hex'))
const toHex = (data: Uint8Array) => Buffer.from(data).toString('hex')
const word = (value: number) => value.toString(16).padStart(8, '0')

describe('SEED (RFC 4269 Appendix B)', () => {
  for (const vector of RFC_4269_VECTORS) {
    describe(vector.id, () => {
      it('블록 암호화 결과가 표준 암호문과 같다', () => {
        assert.equal(
          toHex(seedEncryptBlock(bytes(vector.key), bytes(vector.plaintext))),
          vector.ciphertext,
        )
      })

      it('블록 복호화 결과가 표준 평문과 같다', () => {
        assert.equal(
          toHex(seedDecryptBlock(bytes(vector.key), bytes(vector.ciphertext))),
          vector.plaintext,
        )
      })

      it('키 스케줄의 16개 라운드 서브키가 표준과 같다', () => {
        const roundKeys = seedKeySchedule(bytes(vector.key)).map(([k0, k1]) => [
          word(k0),
          word(k1),
        ])

        assert.deepEqual(roundKeys, vector.roundKeys)
      })
    })
  }
})

describe('SEED-CBC', () => {
  const key = bytes('000102030405060708090a0b0c0d0e0f')
  const iv = bytes('f0e0d0c0b0a090807060504030201000')

  it('암호화한 데이터를 복호화하면 원문이 나온다', () => {
    const plain = new Uint8Array(96).map((_, i) => (i * 7) % 256)

    assert.deepEqual(
      seedCbcDecrypt(key, iv, seedCbcEncrypt(key, iv, plain)),
      plain,
    )
  })

  it('첫 블록은 IV와 XOR한 뒤 ECB로 암호화한다', () => {
    const plain = bytes('00112233445566778899aabbccddeeff')
    const xored = plain.map((value, i) => value ^ iv[i])

    assert.equal(
      toHex(seedCbcEncrypt(key, iv, plain)),
      toHex(seedEncryptBlock(key, xored)),
    )
  })

  it('이전 암호문 블록이 다음 블록에 영향을 준다 (체이닝)', () => {
    const encrypted = seedCbcEncrypt(key, iv, new Uint8Array(32))

    assert.notEqual(toHex(encrypted.subarray(0, 16)), toHex(encrypted.subarray(16)))
  })

  it('길이가 16의 배수가 아니면 거부한다', () => {
    assert.throws(() => seedCbcDecrypt(key, iv, new Uint8Array(17)))
    assert.throws(() => seedCbcEncrypt(key, iv, new Uint8Array(15)))
  })

  it('키와 IV 길이를 검증한다', () => {
    assert.throws(() => seedCbcDecrypt(new Uint8Array(15), iv, new Uint8Array(16)))
    assert.throws(() => seedCbcDecrypt(key, new Uint8Array(8), new Uint8Array(16)))
    assert.throws(() => seedKeySchedule(new Uint8Array(32)))
  })

  it('입력 버퍼를 수정하지 않는다', () => {
    const data = seedCbcEncrypt(key, iv, new Uint8Array(32))
    const copy = new Uint8Array(data)

    seedCbcDecrypt(key, iv, data)

    assert.deepEqual(data, copy)
  })
})
