'use client'

import Link from 'next/link'
import { useState } from 'react'

import { NoticeBox } from '@/components/onboarding/NoticeBox'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const DUMMY_SUMMARY_LINES = [
  '네이버 · example@naver.com / 카드명세서 메일함',
  '현대 매월 25일 · 롯데 매월 20일 · 우리 매월 26일 · 삼성 매월 말일',
  '다음 자동 조회: 2026.10.25 · 한국시간 기준',
  '설정을 마치면 기존 명세서를 한 번 가져옵니다.',
]

const STORAGE_NOTICE_LINES = [
  '네이버 앱 비밀번호와 선택한 카드의 명세서 암호를 암호화해 보관합니다.',
  '설정에서 자동 등록을 끄거나 메일 연결을 해제할 수 있습니다.',
  '연결 해제 시 보관한 연결 정보를 폐기합니다.',
  '폴더 선택이 앱 비밀번호 권한 자체를 제한하지는 않습니다.',
]

export function AutoRegisterForm() {
  const [isAgreed, setIsAgreed] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // TODO : 자동 등록 켜기 API 호출 후 첫 수집 결과 단계로 이동
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <NoticeBox
        title="명세서 도착 예정일마다 자동으로 조회합니다"
        lines={DUMMY_SUMMARY_LINES}
      />
      <h2 className="text-lg font-bold">자동 등록에 필요한 정보를 보관합니다.</h2>
      <NoticeBox title="보관 범위와 관리" lines={STORAGE_NOTICE_LINES} />
      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          id="storageConsent"
          name="storageConsent"
          checked={isAgreed}
          onCheckedChange={setIsAgreed}
        />
        <Label htmlFor="storageConsent">
          자동 등록에 필요한 정보 보관에 동의합니다
        </Label>
      </div>
      <p className="text-[13px]">
        설정에서 언제든 자동 등록을 중지하거나 메일 연결을 해제할 수 있습니다.
      </p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="h-11 w-[150px] font-bold"
          nativeButton={false}
          render={<Link href="/onboarding/collect" />}
        >
          이전
        </Button>
        <Button
          type="submit"
          className="h-11 w-[360px] font-bold"
          disabled={!isAgreed}
        >
          동의하고 자동 등록 켜기
        </Button>
      </div>
    </form>
  )
}
