import Link from 'next/link'

import { NoticeBox } from '@/components/onboarding/NoticeBox'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ResultStat {
  label: string
  value: string
  description: string
}

interface CardResult {
  id: string
  cardName: string
  result: string
  nextAction: string
}

const DUMMY_STATS: ResultStat[] = [
  { label: '찾은 명세서', value: '3개', description: '선택 메일함 기준' },
  { label: '반영한 거래', value: '32건', description: '중복 5건 제외' },
  { label: '확인할 내역', value: '2건', description: '확정 전 합계 제외' },
]

const DUMMY_CARD_RESULTS: CardResult[] = [
  { id: 'hyundai', cardName: '현대', result: '완료 · 신규 32건', nextAction: '가계부에서 확인' },
  { id: 'lotte', cardName: '롯데', result: '금액 확인 2건', nextAction: '확인 필요 목록' },
  { id: 'samsung', cardName: '삼성', result: '문서 암호 대기', nextAction: '설정에서 보완' },
]

const CELL_CLASS = 'px-2.5 py-2 text-sm'

export function FirstCollectResult() {
  return (
    <div className="flex flex-col gap-4">
      <NoticeBox
        lines={[
          '자동 등록 켜짐 · 다음 자동 조회 2026.10.25',
          '이후에는 설정한 명세서 도착일마다 조회합니다.',
        ]}
      />
      <ul className="grid gap-4 sm:grid-cols-3">
        {DUMMY_STATS.map((stat) => (
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
            {DUMMY_CARD_RESULTS.map((itRow) => (
              <tr key={itRow.id}>
                <td className={CELL_CLASS}>{itRow.cardName}</td>
                <td className={CELL_CLASS}>{itRow.result}</td>
                <td className={CELL_CLASS}>{itRow.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[15px]">
        확인이 필요한 내역은 가계부에서 이어서 검토할 수 있습니다.
      </p>
      <div className="flex gap-3">
        {/* TODO : 확인 필요 목록 화면 경로 확정 후 연결 */}
        <Link
          href="/home"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-11 w-[220px] font-bold',
          )}
        >
          확인할 내역 보기
        </Link>
        <Link
          href="/home"
          className={cn(buttonVariants(), 'h-11 w-[300px] font-bold')}
        >
          가계부 시작하기
        </Link>
      </div>
    </div>
  )
}
