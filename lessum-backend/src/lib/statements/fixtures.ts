export function lotteFixture({
  total = '300',
  fee = '0',
  amount1 = '100',
}: { total?: string; fee?: string; amount1?: string } = {}): string {
  return `<html><body>출금일2026년 1월 14일<table>
    <thead><tr><th>이용내역</th><th>이용총액</th><th>할부회차</th></tr></thead><tbody>
    <tr><td><em class="useday">12.20</em>같은상점</td><td>${amount1}</td><td></td><td>100</td><td>0</td><td></td><td></td><td></td></tr>
    <tr><td><em class="useday">12.20</em>같은상점</td><td>100</td><td></td><td>100</td><td>0</td><td></td><td></td><td></td></tr>
    <tr><td><em class="useday">12.21</em>할부상점</td><td>300</td><td>2/3</td><td>100</td><td>0</td><td></td><td></td><td></td></tr>
    <tr><th>카드이용합계</th><td></td><td></td><td>${total}</td><td>${fee}</td></tr>
    </tbody></table></body></html>`
}

export function wooriFixture({
  total = '300',
  fee = '10',
  extraRows = '',
}: { total?: string; fee?: string; extraRows?: string } = {}): string {
  const row = (
    date: string,
    merchant: string,
    original: string,
    billed: string,
    rowFee: string,
  ) =>
    `<tr><td>${date}</td><td>${merchant}</td><td>${original}</td><td></td><td></td><td>${billed}</td><td>${rowFee}</td><td></td><td></td><td>${billed}</td><td></td><td></td><td></td></tr>`
  return `<html><body>결제일 2026년 10월 12일<table><thead><tr><th>이용일자 이용가맹점 납부하실금액</th></tr></thead><tbody>
    <tr><td>(본인 신용 1234)</td></tr>
    ${row('09/01', '같은상점', '100', '100', '10')}
    ${row('09/01', '같은상점', '100', '100', '0')}
    <tr><td>(본인 체크 5678)</td></tr>
    ${row('09/02', '체크상점', '50', '0', '0')}
    ${row('09/03', '환급금', '-100', '-100', '0')}
    ${row('09/04', '다른상점', '200', '200', '0')}
    ${extraRows}
    <tr><td>통합청구합계</td><td></td><td></td><td></td><td>${total}</td><td>${fee}</td></tr>
    </tbody></table></body></html>`
}

export function hyundaiFixture({
  arrayLength = 3,
  declaredCount = 2,
  extraRows = '',
  tables = '',
}: {
  arrayLength?: number
  declaredCount?: number
  extraRows?: string
  tables?: string
} = {}): string {
  const dated = (billedFee: string) =>
    `arUseDesc[loop++] = new UseDesc(loop,'260901','본인',gf_Convert2ByteChar2('카드'),gf_Convert2ByteChar2('상점(주),지점'),'1,000','0','0','1,000','${billedFee}','0','','0','0','N','110113');`
  return `<html><body>결제일 : 2026년 10월 12일${tables}<script>arUseDesc = Array(${arrayLength});
    ${dated('10')}
    ${dated('0')}
    ${extraRows}
    arUseDesc[loop++] = new UseDesc(loop,'','',gf_Convert2ByteChar2(''),gf_Convert2ByteChar2('총합계${declaredCount}건'),'0','0','0','2,000','10','0','','0','0','N','999999');
    </script></body></html>`
}

export function buildEmail(
  attachments: {
    filename: string
    content: Uint8Array | string
    contentType?: string
  }[],
  headers: Record<string, string> = {},
): Buffer {
  const boundary = 'TEST-BOUNDARY-1234'
  const head = {
    From: 'sender@example.com',
    To: 'user@naver.com',
    Subject: 'statement',
    'MIME-Version': '1.0',
    ...headers,
    'Content-Type': `multipart/mixed; boundary="${boundary}"`,
  }

  const parts = [
    `--${boundary}\r\nContent-Type: text/plain; charset="utf-8"\r\n\r\nnotification\r\n`,
    ...attachments.map((attachment) => {
      const body = Buffer.from(attachment.content)
        .toString('base64')
        .replace(/(.{76})/g, '$1\r\n')
      return (
        `--${boundary}\r\n` +
        `Content-Type: ${attachment.contentType ?? 'text/html'}\r\n` +
        `Content-Disposition: attachment; filename="${attachment.filename}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n\r\n${body}\r\n`
      )
    }),
    `--${boundary}--\r\n`,
  ]

  const headerLines = Object.entries(head).map(([k, v]) => `${k}: ${v}`)
  return Buffer.from(headerLines.join('\r\n') + '\r\n\r\n' + parts.join(''))
}

const EUC_KR_WORDS: Record<string, string> = {
  출금일: 'c3e2b1ddc0cf',
  년: 'b3e2',
  월: 'bff9',
  일: 'c0cf',
  이용내역: 'c0ccbfebb3bbbfaa',
  이용총액: 'c0ccbfebc3d1bed7',
  할부회차: 'c7d2bacec8b8c2f7',
  같은상점: 'b0b0c0babbf3c1a1',
  할부상점: 'c7d2bacebbf3c1a1',
  카드이용합계: 'c4abb5e5c0ccbfebc7d5b0e8',
}

export function lotteFixtureEucKr(): Buffer {
  const pattern = new RegExp(`(${Object.keys(EUC_KR_WORDS).join('|')})`)
  const pieces = lotteFixture()
    .split(pattern)
    .map((piece) =>
      piece in EUC_KR_WORDS
        ? Buffer.from(EUC_KR_WORDS[piece], 'hex')
        : Buffer.from(piece, 'ascii'),
    )
  return Buffer.concat(pieces)
}
