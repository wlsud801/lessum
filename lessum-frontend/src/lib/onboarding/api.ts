import axios from 'axios'

import { getAccessToken } from '@/lib/auth/api'

import type {
  CardIssuersResponse,
  CollectRunResponse,
  CollectSettingsPayload,
  CollectSummaryResponse,
  CreateCollectRunResponse,
  MailboxesResponse,
} from './types'

export async function verifyMailConnection(
  accessToken: string,
  email: string,
  appPassword: string,
): Promise<void> {
  await axios.post(
    `${process.env.API_BASE_URL}/mail-connections/verify`,
    { email, app_password: appPassword },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
}

export async function getMailboxes(
  accessToken: string,
): Promise<MailboxesResponse> {
  const { data } = await axios.get<MailboxesResponse>(
    `${process.env.API_BASE_URL}/mail-connections/mailboxes`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return data
}

export async function getCardIssuers(
  accessToken: string,
): Promise<CardIssuersResponse> {
  const { data } = await axios.get<CardIssuersResponse>(
    `${process.env.API_BASE_URL}/card-issuers`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return data
}

export async function saveCollectSettings(
  accessToken: string,
  payload: CollectSettingsPayload,
): Promise<void> {
  await axios.put(
    `${process.env.API_BASE_URL}/collect-settings`,
    {
      mailbox_imap_name: payload.mailboxImapName,
      start_date: payload.startDate,
      cards: payload.cards.map((card) => ({
        issuer: card.issuer,
        arrival_day: card.arrivalDay,
        ...(card.statementPassword
          ? { statement_password: card.statementPassword }
          : {}),
      })),
    },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
}

export async function enableAutoRegister(accessToken: string): Promise<void> {
  await axios.post(
    `${process.env.API_BASE_URL}/auto-register/enable`,
    { storage_consent: true },
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
}

export async function getCollectSummary(
  accessToken: string,
): Promise<CollectSummaryResponse> {
  const { data } = await axios.get<CollectSummaryResponse>(
    `${process.env.API_BASE_URL}/collect-settings`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return data
}

export async function disableAutoRegister(accessToken: string): Promise<void> {
  await axios.post(
    `${process.env.API_BASE_URL}/auto-register/disable`,
    undefined,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
}

export async function createCollectRun(
  accessToken: string,
): Promise<CreateCollectRunResponse> {
  const { data } = await axios.post<CreateCollectRunResponse>(
    `${process.env.API_BASE_URL}/collect-runs`,
    undefined,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return data
}

export async function getCollectRun(
  accessToken: string,
  runId: string,
): Promise<CollectRunResponse> {
  const { data } = await axios.get<CollectRunResponse>(
    `${process.env.API_BASE_URL}/collect-runs/${runId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return data
}

export async function getLatestCollectRun(
  accessToken: string,
): Promise<CollectRunResponse> {
  const { data } = await axios.get<CollectRunResponse>(
    `${process.env.API_BASE_URL}/collect-runs/latest`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  return data
}

export async function completeOnboarding(): Promise<void> {
  const token = await getAccessToken()
  if (!token) {
    return
  }

  await axios.post(
    `${process.env.API_BASE_URL}/me/onboarding/complete`,
    undefined,
    { headers: { Authorization: `Bearer ${token}` } },
  )
}
