import { createHash } from 'node:crypto'
import { crc32 } from 'node:zlib'

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

export function buildZip(
  entries: { name: string; content?: string; declaredSize?: number }[],
): Buffer {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const content = Buffer.from(entry.content ?? '', 'utf8')
    const crc = crc32(content)
    const declared = entry.declaredSize ?? content.length

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(declared, 22)
    local.writeUInt16LE(name.length, 26)
    locals.push(local, name, content)

    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt32LE(crc, 16)
    header.writeUInt32LE(content.length, 20)
    header.writeUInt32LE(declared, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt32LE(offset, 42)
    central.push(header, name)

    offset += local.length + name.length + content.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}
