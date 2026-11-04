import Link from 'next/link'

import { FinishOnboardingForm } from '@/components/onboarding/FinishOnboardingForm'
import { NoticeBox } from '@/components/onboarding/NoticeBox'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CollectSettingRow {
  label: string
  value: string
}

const DUMMY_SETTING_ROWS: CollectSettingRow[] = [
  { label: '메일함', value: '카드명세서' },
  { label: '가져오기 시작일', value: '2026.10.01' },
  { label: '수집 카드사', value: '현대 · 롯데 · 우리 · 삼성' },
]

const CELL_CLASS = 'px-2.5 py-2 text-sm'

export function EmptyCollectResult() {
  return (
    <div className="flex flex-col gap-4">
      <NoticeBox
        lines={[
          '메일 연결 완료 · 자동 등록 켜짐',
          '다음 자동 조회: 2026.10.25',
        ]}
      />
      <NoticeBox
        title="아직 가져올 명세서가 없어요"
        lines={[
          '선택한 메일함과 기간에서 지원 명세서를 찾지 못했습니다.',
          '명세서 도착 예정일에 다시 조회합니다. 가계부에서 언제든 직접 확인할 수도 있습니다.',
        ]}
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[420px] table-fixed border-collapse text-left">
          <caption className="sr-only">현재 수집 설정</caption>
          <colgroup>
            <col className="w-[220px]" />
            <col />
          </colgroup>
          <thead className="bg-muted text-[13px] font-bold">
            <tr>
              <th scope="col" className={CELL_CLASS}>확인할 내용</th>
              <th scope="col" className={CELL_CLASS}>현재 설정</th>
            </tr>
          </thead>
          <tbody>
            {DUMMY_SETTING_ROWS.map((itRow) => (
              <tr key={itRow.label}>
                <td className={CELL_CLASS}>{itRow.label}</td>
                <td className={CELL_CLASS}>{itRow.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <Link
          href="/onboarding/collect"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-11 w-[270px] font-bold',
          )}
        >
          수집 설정 다시 확인
        </Link>
        <FinishOnboardingForm label="가계부 시작하기" className="w-[300px]" />
      </div>
      <p className="text-[15px]">
        CSV와 직접 입력은 가계부에 들어간 뒤 누락된 내역이 있을 때 이용할 수
        있습니다.
      </p>
    </div>
  )
}
