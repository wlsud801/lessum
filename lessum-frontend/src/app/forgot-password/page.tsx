import Link from 'next/link'

import { AuthCard } from '@/components/auth/AuthCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="비밀번호 재설정 요청">
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="가입 이메일을 입력하세요"
          />
        </div>
        <Button type="submit" size="lg" className="w-full">
          재설정 링크 받기
        </Button>
      </form>
      <Alert>
        <AlertTitle>안내</AlertTitle>
        <AlertDescription>
          등록된 이메일이라면 재설정 안내가 발송됩니다.
        </AlertDescription>
      </Alert>
      <Link
        href="/login"
        className={buttonVariants({
          variant: 'outline',
          size: 'lg',
          className: 'w-full',
        })}
      >
        로그인으로
      </Link>
    </AuthCard>
  )
}
