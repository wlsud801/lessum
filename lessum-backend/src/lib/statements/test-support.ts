import { createHash } from 'node:crypto'

import { seedCbcEncrypt } from './seed.js'

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest()

function padPkcs7(data: Uint8Array): Uint8Array {
  const padding = 16 - (data.length % 16)
  return Buffer.concat([data, Buffer.alloc(padding, padding)])
}

export function encryptVestmail(
  plain: string | Uint8Array,
  password = 'test-only',
  chunkSize = 96,
): string {
  const data = typeof plain === 'string' ? Buffer.from(plain, 'utf8') : Buffer.from(plain)
  const digest = sha256(Buffer.from(password, 'utf8'))
  const iv = digest.subarray(0, 16)
  const key = sha256(digest).subarray(0, 16)

  const chunks: string[] = []
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const framed = padPkcs7(
      Buffer.concat([key, data.subarray(offset, offset + chunkSize)]),
    )
    const encrypted = seedCbcEncrypt(key, iv, framed)
    chunks.push(
      Buffer.concat([Buffer.alloc(16, '0'), encrypted]).toString('base64'),
    )
  }

  return (
    'VestMail window.x.s2=x.oa eval(atob(b_p)) ' +
    chunks.map((chunk, index) => `s[${index}]="${chunk}";`).join('')
  )
}
