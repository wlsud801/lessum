import { FinishOnboardingForm } from '@/components/onboarding/FinishOnboardingForm'
import { NoticeBox } from '@/components/onboarding/NoticeBox'
import { formatDisplayDate } from '@/lib/onboarding/collect-schedule'
import type {
  CollectRunCard,
  CollectRunResponse,
} from '@/lib/onboarding/types'

interface FirstCollectResultProps {
  run: CollectRunResponse
}

const CELL_CLASS = 'px-2.5 py-2 text-sm'

function noticeLines(run: CollectRunResponse): string[] {
  const nextLine = run.next_collect_on
    ? `자동 등록 켜짐 · 다음 자동 조회 ${formatDisplayDate(run.next_collect_on)}`
    : '자동 등록 켜짐'

  if (run.status === 'failed') {
    return [
      '첫 수집에 실패했습니다. 잠시 후 다시 시도해주세요.',
      nextLine,
    ]
  }
  if (run.status !== 'completed') {
    return [
      '첫 수집을 진행하고 있습니다. 잠시 후 새로고침해주세요.',
      nextLine,
    ]
  }
  return [nextLine, '이후에는 설정한 명세서 도착일마다 조회합니다.']
}

function cardResultView(card: CollectRunCard): {
  result: string
  nextAction: string
} {
  switch (card.status) {
    case 'parsed':
      return {
        result: `완료 · 신규 ${card.rows_added}건`,
        nextAction: '가계부에서 확인',
      }
    case 'needs_review':
      return {
        result: `금액 확인 ${card.rows_review}건`,
        nextAction: '확인 필요 목록',
      }
    case 'password_required':
      return { result: '문서 암호 대기', nextAction: '설정에서 보완' }
    case 'online_statement_required':
      return { result: '온라인 명세서 조회 필요', nextAction: '설정에서 보완' }
    case 'not_found':
      return { result: '명세서 없음', nextAction: '도착일에 자동 조회' }
    case 'received':
      return { result: '명세서 수신 · 처리 중', nextAction: '잠시 후 새로고침' }
    case 'unsupported_format':
      return { result: '지원하지 않는 형식', nextAction: '설정에서 보완' }
    case 'error':
      return { result: '오류 발생', nextAction: '잠시 후 다시 시도' }
    default:
      return { result: '대기 중', nextAction: '잠시 후 새로고침' }
  }
}

export function FirstCollectResult({ run }: FirstCollectResultProps) {
  const stats = [
    {
      label: '찾은 명세서',
      value: `${run.totals.statements_found}개`,
      description: '선택 메일함 기준',
    },
    {
      label: '반영한 거래',
      value: `${run.totals.rows_added}건`,
      description: `중복 ${run.totals.rows_duplicated}건 제외`,
    },
    {
      label: '확인할 내역',
      value: `${run.totals.rows_review}건`,
      description: '확정 전 합계 제외',
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <NoticeBox lines={noticeLines(run)} />
      <ul className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <li
            key={stat.label}
            className="flex flex-col gap-1.5 rounded-lg border bg-muted/40 p-[18px]"
          >
            <p className="text-sm">{stat.label}</p>
            <p className="text-[27px] font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.description}</p>
          </li>
        ))}
      </ul>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
          <caption className="sr-only">카드별 첫 수집 처리 결과</caption>
          <colgroup>
            <col className="w-[160px]" />
            <col className="w-[330px]" />
            <col />
          </colgroup>
          <thead className="bg-muted text-[13px] font-bold">
            <tr>
              <th scope="col" className={CELL_CLASS}>카드</th>
              <th scope="col" className={CELL_CLASS}>처리 결과</th>
              <th scope="col" className={CELL_CLASS}>다음 동작</th>
            </tr>
          </thead>
          <tbody>
            {run.cards.map((itCard) => {
              const view = cardResultView(itCard)
              return (
                <tr key={itCard.issuer}>
                  <td className={CELL_CLASS}>{itCard.name}</td>
                  <td className={CELL_CLASS}>{view.result}</td>
                  <td className={CELL_CLASS}>{view.nextAction}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[15px]">
        확인이 필요한 내역은 가계부에서 이어서 검토할 수 있습니다.
      </p>
      <div className="flex gap-3">
        {/* TODO : 확인 필요 목록 화면 경로 확정 후 해당 화면으로 이동 */}
        <FinishOnboardingForm
          label="확인할 내역 보기"
          variant="outline"
          className="w-[220px]"
        />
        <FinishOnboardingForm label="가계부 시작하기" className="w-[300px]" />
      </div>
    </div>
  )
}
