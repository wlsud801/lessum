import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const VERSION = 'v1'

export function parseEncryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `암호화 키는 base64로 인코딩된 ${KEY_BYTES}바이트여야 합니다.`,
    )
  }
  return key
}

export function encryptSecret(
  key: Buffer,
  plaintext: string,
  context: string,
): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])

  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptSecret(
  key: Buffer,
  payload: string,
  context: string,
): string {
  const [version, iv, tag, encrypted, ...rest] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !encrypted || rest.length > 0) {
    throw new Error('지원하지 않는 암호문 형식입니다.')
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64url'),
  )
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
