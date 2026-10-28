const BASE64_BLOCK = /^[A-Za-z0-9+,]+$/

export function decodeImapUtf7(raw: string): string {
  if (/&[^-]*$/.test(raw)) {
    throw new Error('메일함 이름 인코딩이 완전하지 않습니다.')
  }

  return raw.replace(/&([^-]*)-/g, (_match, encoded: string) => {
    if (encoded === '') {
      return '&'
    }
    if (!BASE64_BLOCK.test(encoded)) {
      throw new Error('메일함 이름 인코딩이 올바르지 않습니다.')
    }

    const bytes = Buffer.from(encoded.replace(/,/g, '/'), 'base64')
    if (bytes.length === 0 || bytes.length % 2 !== 0) {
      throw new Error('메일함 이름 인코딩이 올바르지 않습니다.')
    }
    return bytes.swap16().toString('utf16le')
  })
}
