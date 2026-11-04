export interface CardIssuer {
  id: string
  name: string
  supported: boolean
  needsStatementPassword: boolean
}

export const CARD_ISSUERS: CardIssuer[] = [
  { id: 'hyundai', name: '현대', supported: true, needsStatementPassword: true },
  { id: 'lotte', name: '롯데', supported: true, needsStatementPassword: false },
  { id: 'woori', name: '우리', supported: true, needsStatementPassword: true },
  { id: 'samsung', name: '삼성', supported: true, needsStatementPassword: true },
  { id: 'shinhan', name: '신한', supported: false, needsStatementPassword: false },
]

export function findCardIssuer(id: string): CardIssuer | undefined {
  return CARD_ISSUERS.find((issuer) => issuer.id === id)
}
