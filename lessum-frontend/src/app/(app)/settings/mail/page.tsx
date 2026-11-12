import { isAxiosError } from 'axios'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

import { ActionLink } from '@/components/settings/ActionLink'
import { AutoCollectToggle } from '@/components/settings/AutoCollectToggle'
import { StatementPasswordDialog } from '@/components/settings/StatementPasswordDialog'
import { Card } from '@/components/ui/card'
import { getAccessToken } from '@/lib/auth/api'
import { getCollectSummary, getLatestCollectRun } from '@/lib/onboarding/api'
import { formatDisplayDate } from '@/lib/onboarding/collect-schedule'
import { getReviewCount } from '@/lib/transactions/api'

import type {
  ArrivalDay,
  CollectRunCard,
  CollectRunResponse,
  CollectSummaryResponse,
} from '@/lib/onboarding/types'

const PROVIDER_LABELS: Record<string, string> = {
  naver: '네이버',
}

const TABLE_HEADERS = [
  { label: '카드', width: 'w-[120px]' },
  { label: '명세서 도착일', width: 'w-[156px]' },
  { label: '다음 자동 조회', width: 'w-[180px]' },
  { label: '최근 메일 수신', width: 'w-[220px]' },
  { label: '거래 반영', width: '' },
  { label: '수집 결과', width: 'w-[200px]' },
]

async function getCollectSummaryOrNull(
  token: string,
): Promise<CollectSummaryResponse | null> {
  try {
    return await getCollectSummary(token)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    throw error
  }
}

async function getLatestCollectRunOrNull(
  token: string,
): Promise<CollectRunResponse | null> {
  try {
    return await getLatestCollectRun(token)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    throw error
  }
}

function arrivalLabel(day: ArrivalDay) {
  return day === 'last' ? '매월 말일' : `매월 ${day}일`
}

function statementMonthLabel(value: string | null): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(value ? new Date(value) : new Date())
  const part = (type: string) =>
    parts.find((itPart) => itPart.type === type)?.value ?? ''
  return `${part('year')}년 ${part('month')}월 명세서`
}

function formatDateTime(value: string | null): string | null {
  if (!value) {
    return null
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const part = (type: string) =>
    parts.find((itPart) => itPart.type === type)?.value ?? ''
  return `${part('month')}.${part('day')} ${part('hour')}:${part('minute')}`
}

function receiveLines(
  runCard: CollectRunCard | undefined,
  checkedAt: string | null,
): string[] {
  if (!runCard || runCard.status === 'queued') {
    return ['대기 중']
  }
  if (runCard.status === 'not_found') {
    return ['미도착']
  }
  return checkedAt ? ['수신 성공', checkedAt] : ['수신 성공']
}

function reflectLines(runCard: CollectRunCard | undefined): string[] {
  if (!runCard) {
    return ['첫 수집을 기다리고 있어요']
  }
  switch (runCard.status) {
    case 'parsed':
      return ['반영 완료', `신규 ${runCard.rows_added}건 · 중복 ${runCard.rows_duplicated}건`]
    case 'needs_review':
      return ['금액 확인 필요', `확인할 거래 ${runCard.rows_review}건`]
    case 'password_required':
      return ['문서 암호 입력 대기']
    case 'online_statement_required':
      return ['온라인 명세서 조회 필요']
    case 'not_found':
      return ['명세서 미도착']
    case 'received':
      return ['명세서 수신 · 처리 중']
    case 'unsupported_format':
      return ['지원하지 않는 형식']
    case 'error':
      return ['오류 발생']
    default:
      return ['대기 중']
  }
}

function rowAction(runCard: CollectRunCard | undefined): {
  label: string
  href?: string
} {
  switch (runCard?.status) {
    case 'parsed':
      return { label: '등록 거래 보기 →', href: '/transactions' }
    case 'needs_review':
      return { label: '금액 확인 →', href: '/transactions' }
    default:
      return { label: '결과 보기 →' }
  }
}

export default async function MailCollectPage() {
  await connection()

  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  const [summary, run, reviewCount] = await Promise.all([
    getCollectSummaryOrNull(token),
    getLatestCollectRunOrNull(token),
    getReviewCount(),
  ])

  if (!summary) {
    redirect('/settings')
  }

  const provider =
    PROVIDER_LABELS[summary.connection.provider] ?? summary.connection.provider
  const checkedAt = formatDateTime(run?.finished_at ?? run?.created_at ?? null)
  const runCardsByIssuer = new Map(
    (run?.cards ?? []).map((itCard) => [itCard.issuer, itCard]),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted-foreground">
          <Link href="/settings" className="cursor-pointer hover:underline">
            가계부 관리
          </Link>
          {' / 연결 관리 / 메일 자동 수집'}
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] font-bold">메일 자동 수집</h1>
          <p className="text-base text-muted-foreground">
            명세서가 도착하면 거래 내역을 자동으로 모아요.
          </p>
        </div>
      </div>

      <Card className="flex-row items-center gap-6 bg-muted/40 p-6">
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">연결된 메일</p>
          <p className="text-lg font-bold">
            {provider} · {summary.connection.email}
          </p>
          <p className="text-sm text-muted-foreground">
            수집 메일함: {summary.mailbox_name}
          </p>
        </div>
        <div className="flex w-[300px] flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">자동 수집</p>
          <AutoCollectToggle defaultEnabled={summary.auto_register_enabled} />
          <p className="text-[13px] text-muted-foreground">
            명세서 도착일에 자동으로 확인해요.
          </p>
        </div>
        <div className="flex w-[204px] flex-col gap-2">
          <ActionLink label="연결 설정 →" className="w-full" />
          <p className="text-center text-xs text-muted-foreground">
            {checkedAt ? `최근 확인 ${checkedAt}` : '최근 확인 기록 없음'}
          </p>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-6 rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <p className="text-[17px] font-bold">
            확인할 거래 내역 {reviewCount}건
          </p>
          <p className="text-sm text-muted-foreground">
            확정되지 않은 금액과 분류를 확인해 주세요.
          </p>
        </div>
        <ActionLink label="내역 확인 →" href="/transactions" />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-6">
          <h2 className="text-lg font-bold">카드별 수집 일정과 최근 결과</h2>
          <ActionLink label="도착일·수집 설정 →" />
        </div>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                {TABLE_HEADERS.map((itHeader) => (
                  <th
                    key={itHeader.label}
                    className={`px-3 py-2.5 text-left text-[13px] font-bold ${itHeader.width}`}
                  >
                    {itHeader.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.cards.map((itCard) => {
                const runCard = runCardsByIssuer.get(itCard.issuer)
                const action = rowAction(runCard)

                return (
                  <tr key={itCard.issuer} className="border-t">
                    <td className="px-3 py-4 text-base font-bold">
                      {itCard.name}
                    </td>
                    <td className="px-3 py-4 text-sm">
                      {arrivalLabel(itCard.arrival_day)}
                    </td>
                    <td className="px-3 py-4 text-sm">
                      {itCard.next_collect_on
                        ? formatDisplayDate(itCard.next_collect_on)
                        : '—'}
                    </td>
                    <td className="px-3 py-4 text-sm text-muted-foreground">
                      {receiveLines(runCard, checkedAt).map((itLine) => (
                        <p key={itLine}>{itLine}</p>
                      ))}
                    </td>
                    <td className="px-3 py-4 text-sm">
                      {reflectLines(runCard).map((itLine) => (
                        <p key={itLine}>{itLine}</p>
                      ))}
                    </td>
                    <td className="px-3 py-1">
                      {runCard?.status === 'password_required' ? (
                        <StatementPasswordDialog
                          issuer={itCard.issuer}
                          cardName={itCard.name}
                          statementLabel={statementMonthLabel(
                            run?.created_at ?? null,
                          )}
                        />
                      ) : (
                        <ActionLink
                          label={action.label}
                          href={action.href}
                          className="justify-start px-0"
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted-foreground">
          ‘켜짐’ 옆 새로고침 아이콘으로 새 명세서를 불러와요. 아직 오지 않은
          명세서는 ‘미도착’으로 안내해요.
        </p>
        <p className="text-[13px] text-muted-foreground">
          명세서 파일은 분석에만 사용하고 보관하지 않아요. 추출한 거래 내역은
          가계부에 저장해요.
        </p>
      </section>
    </div>
  )
}
