import { createHash, timingSafeEqual } from 'node:crypto'

import { StatementFormatError } from './errors.js'
import { seedCbcDecrypt } from './seed.js'

const REQUIRED_MARKERS = ['VestMail', 'window.x.s2=x.oa', 'eval(atob(b_p))']
const CHUNK_PATTERN = /s\[(\d+)\]\s*=\s*"([A-Za-z0-9+/=]+)"/g
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
const HTML_START_PATTERN = /^\s*(?:<!doctype|<html)/i
const BLOCK_BYTES = 16
const MIN_ENVELOPE_BYTES = 48

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest()

function unpadPkcs7(data: Uint8Array): Uint8Array {
  const padding = data[data.length - 1]
  if (
    !padding ||
    padding > BLOCK_BYTES ||
    padding > data.length ||
    data.subarray(data.length - padding).some((value) => value !== padding)
  ) {
    throw new Error('bad padding')
  }
  return data.subarray(0, data.length - padding)
}

function decryptChunk(encoded: string, key: Buffer, iv: Buffer): Uint8Array {
  if (!BASE64_PATTERN.test(encoded)) {
    throw new Error('bad base64')
  }
  const envelope = Buffer.from(encoded, 'base64')
  if (envelope.length < MIN_ENVELOPE_BYTES || envelope.length % BLOCK_BYTES) {
    throw new Error('bad envelope')
  }

  const framed = unpadPkcs7(
    seedCbcDecrypt(key, iv, envelope.subarray(BLOCK_BYTES)),
  )
  if (framed.length < BLOCK_BYTES) {
    throw new Error('bad password marker')
  }
  const marker = Buffer.from(framed.subarray(0, BLOCK_BYTES))
  if (!timingSafeEqual(marker, key)) {
    throw new Error('bad password marker')
  }
  return framed.subarray(BLOCK_BYTES)
}

export function decryptVestmail(text: string, password: string): string {
  if (!REQUIRED_MARKERS.every((marker) => text.includes(marker))) {
    throw new StatementFormatError('Unrecognized encrypted-HTML template')
  }

  const chunks = [...text.matchAll(CHUNK_PATTERN)].map((match) => ({
    index: Number(match[1]),
    encoded: match[2],
  }))
  if (
    chunks.length === 0 ||
    chunks.some((chunk, position) => chunk.index !== position)
  ) {
    throw new StatementFormatError(
      'Encrypted chunks missing, reordered, or duplicated',
    )
  }

  const digest = sha256(Buffer.from(password, 'utf8'))
  const iv = digest.subarray(0, BLOCK_BYTES)
  const key = sha256(digest).subarray(0, BLOCK_BYTES)

  let result: string
  try {
    const parts = chunks.map((chunk) => decryptChunk(chunk.encoded, key, iv))
    result = new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(parts),
    )
  } catch {
    throw new StatementFormatError(
      'Password incorrect, attachment damaged, or envelope changed',
    )
  }

  if (!HTML_START_PATTERN.test(result)) {
    throw new StatementFormatError('Decrypted attachment is not supported HTML')
  }
  return result
}
