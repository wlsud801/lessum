import Link from 'next/link'

import { AuthCard } from '@/components/auth/AuthCard'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  return (
    <AuthCard title="로그인">
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="이메일을 입력하세요"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호를 입력하세요"
          />
        </div>
        <Button type="submit" size="lg" className="w-full">
          로그인
        </Button>
      </form>
      <div className="flex gap-3">
        <Link
          href="/signup"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          회원가입
        </Link>
        <Link
          href="/forgot-password"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          비밀번호 찾기
        </Link>
      </div>
    </AuthCard>
  )
}
