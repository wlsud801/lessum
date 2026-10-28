import Link from 'next/link'

import { AuthCard } from '@/components/auth/AuthCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'

export default function SignupVerifyPage() {
  return (
    <AuthCard title="이메일 확인">
      <Alert>
        <AlertTitle>이메일을 확인해주세요</AlertTitle>
        <AlertDescription>
          u***@example.com
          <br />
          메일의 확인 링크를 열어주세요.
        </AlertDescription>
      </Alert>
      <div className="text-sm">
        <p>확인 상태: 대기 중</p>
        <p>재전송 가능 시각: 14:35</p>
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg">
          확인 메일 다시 보내기
        </Button>
        <Link
          href="/login"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          로그인으로
        </Link>
      </div>
      <Alert variant="destructive">
        <AlertTitle>만료 상태 예시</AlertTitle>
        <AlertDescription>
          링크가 만료되었습니다. 다시 받아주세요.
        </AlertDescription>
      </Alert>
    </AuthCard>
  )
}
