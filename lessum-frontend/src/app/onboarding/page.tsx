import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function OnboardingStartPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <h1 className="text-[28px] font-bold">메일 명세서로 가계부를 시작하세요</h1>
        <div className="flex flex-col text-[21px]">
          <p>메일로 받은 카드 명세서를 자동으로 정리해드립니다.</p>
          <p>명세서를 받는 메일을 연결해주세요.</p>
        </div>
        <p className="rounded-lg border bg-muted/40 p-5 text-[17px] font-bold">
          ! 현재는 네이버 메일만 지원합니다.
        </p>
        <Link
          href="/onboarding/mail"
          className={cn(buttonVariants(), 'h-11 w-full font-bold')}
        >
          네이버 메일 연결하기
        </Link>
        <Link
          href="/home"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'h-11 w-full font-bold',
          )}
        >
          나중에 시작하기
        </Link>
        <p className="text-sm text-muted-foreground">
          파일·CSV·직접 입력은 설정 완료 후 누락 내역을 보충할 때 사용할 수 있습니다.
        </p>
      </div>
    </main>
  )
}
