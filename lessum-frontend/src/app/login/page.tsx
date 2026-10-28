import Link from 'next/link'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-[90px]">
      <Card className="w-full max-w-[520px]">
        <CardHeader>
          <p className="text-lg font-bold">Lessum</p>
          <CardTitle className="text-3xl font-bold">로그인</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
        </CardContent>
      </Card>
    </main>
  )
}
