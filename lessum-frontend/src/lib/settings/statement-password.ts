const BIRTH_DATE_ISSUERS = ['lotte']

export function isBirthDatePassword(issuer: string) {
  return BIRTH_DATE_ISSUERS.includes(issuer)
}

export function statementPasswordLabel(issuer: string) {
  return isBirthDatePassword(issuer) ? '생년월일 6자리' : '명세서 열기 암호'
}

export function statementPasswordPlaceholder(issuer: string) {
  return isBirthDatePassword(issuer) ? '예) 881212' : '••••••'
}
