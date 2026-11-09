export interface OnboardingActionState {
  error?: string
}

export interface Mailbox {
  name: string
  imap_name: string
}

export interface MailboxesResponse {
  email: string
  mailboxes: Mailbox[]
}

export interface CardIssuer {
  id: string
  name: string
  supported: boolean
  needs_statement_password: boolean
}

export interface CardIssuersResponse {
  issuers: CardIssuer[]
}

export interface CollectSummaryCard {
  issuer: string
  name: string
  arrival_day: ArrivalDay
  next_collect_on: string | null
}

export interface CollectSummaryResponse {
  connection: { provider: string; email: string }
  mailbox_name: string
  start_date: string
  auto_register_enabled: boolean
  cards: CollectSummaryCard[]
  next_collect_on: string | null
}

export type CollectRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export type CollectRunCardStatus =
  | 'queued'
  | 'not_found'
  | 'received'
  | 'password_required'
  | 'parsed'
  | 'needs_review'
  | 'online_statement_required'
  | 'unsupported_format'
  | 'error'

export interface CollectRunCard {
  issuer: string
  name: string
  status: CollectRunCardStatus
  statements_found: number
  rows_added: number
  rows_duplicated: number
  rows_review: number
  error_code: string | null
}

export interface CollectRunTotals {
  statements_found: number
  rows_added: number
  rows_duplicated: number
  rows_review: number
}

export interface CollectRunResponse {
  run_id: string
  trigger: string
  status: CollectRunStatus
  error_code: string | null
  created_at: string
  finished_at: string | null
  totals: CollectRunTotals
  cards: CollectRunCard[]
  next_collect_on: string | null
}

export interface CreateCollectRunResponse {
  run_id: string
  status: CollectRunStatus
  created_at: string
}

export type ArrivalDay = number | 'last'

export interface CollectCardPayload {
  issuer: string
  arrivalDay: ArrivalDay
  statementPassword?: string
}

export interface CollectSettingsPayload {
  mailboxImapName: string
  startDate: string
  cards: CollectCardPayload[]
}
