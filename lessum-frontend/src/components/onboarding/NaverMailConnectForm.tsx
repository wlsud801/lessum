'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const GUIDE_STEPS = [
  [
    'PC 네이버 메일 → 환경설정 → POP3/IMAP 설정 → IMAP/SMTP 설정',
    '‘IMAP/SMTP 사용’을 ‘사용함’으로 설정',
  ],
  ['네이버ID → 보안설정 → 기본보안설정 → 2단계 인증 설정'],
  [
    '2단계 인증 ‘관리’ → 애플리케이션 비밀번호 관리 → ‘Lessum’ 입력 → 생성',
    '발급받은 비밀번호를 아래에 입력해주세요.',
  ],
]

export function NaverMailConnectForm() {
  const [email, setEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')

  const isFilled = email.trim() !== '' && appPassword !== ''

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // TODO : 메일 연결 확인 API 호출 후 성공 시 수집 설정 단계로 이동
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-5">
        <h2 className="text-[17px] font-bold">연결 전에 준비해주세요</h2>
        <ol className="flex flex-col gap-0.5 text-[15px] text-muted-foreground">
          {GUIDE_STEPS.map((lines, index) => (
            <li key={lines[0]}>
              <p>
                {index + 1}. {lines[0]}
              </p>
              {lines.slice(1).map((line) => (
                <p key={line} className="pl-4">
                  {line}
                </p>
              ))}
            </li>
          ))}
        </ol>
      </section>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="naverEmail" className="font-bold">
          네이버 이메일 *
        </Label>
        <Input
          id="naverEmail"
          name="naverEmail"
          type="email"
          autoComplete="email"
          placeholder="example@naver.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="appPassword" className="font-bold">
          앱 비밀번호 *
        </Label>
        <Input
          id="appPassword"
          name="appPassword"
          type="password"
          autoComplete="off"
          placeholder="발급받은 앱 비밀번호를 입력하세요"
          value={appPassword}
          onChange={(event) => setAppPassword(event.target.value)}
          className="h-11"
          required
        />
      </div>
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="h-11 w-[150px] font-bold"
          nativeButton={false}
          render={<Link href="/onboarding" />}
        >
          이전
        </Button>
        <Button
          type="submit"
          className="h-11 w-[300px] font-bold"
          disabled={!isFilled}
        >
          연결 확인 후 다음
        </Button>
      </div>
    </form>
  )
}
