export const ISSUER_SENDER_DOMAINS: Record<string, string[]> = {
  hyundai: ['hyundaicard.com'],
  lotte: ['lottecard.co.kr', 'lottecardmailcenter.net'],
  woori: ['wooricard.com'],
  samsung: ['samsungcard.com'],
}

export function matchIssuerBySender(
  address: string | null | undefined,
): string | null {
  if (!address) {
    return null
  }
  const domain = address.toLowerCase().split('@')[1] ?? ''
  if (!domain) {
    return null
  }

  for (const [issuer, domains] of Object.entries(ISSUER_SENDER_DOMAINS)) {
    const matched = domains.some(
      (itDomain) => domain === itDomain || domain.endsWith(`.${itDomain}`),
    )
    if (matched) {
      return issuer
    }
  }
  return null
}
