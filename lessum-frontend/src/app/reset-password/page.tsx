import Link from 'next/link'

import { AuthCard } from '@/components/auth/AuthCard'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function ResetPasswordPage() {
  return (
    <AuthCard title="새 비밀번호 설정">
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">새 비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="새 비밀번호를 입력하세요"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="passwordConfirm">새 비밀번호 확인</Label>
          <Input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            placeholder="같은 비밀번호를 다시 입력하세요"
          />
        </div>
        <p className="text-sm">□ 비밀번호 정책 충족 □ 확인값 일치</p>
        <Button type="submit" size="lg" className="w-full">
          변경하기
        </Button>
      </form>
      <p className="text-sm">링크 만료 시: 다시 링크 받기</p>
      <Link
        href="/forgot-password"
        className={buttonVariants({
          variant: 'outline',
          size: 'lg',
          className: 'w-full',
        })}
      >
        링크 다시 받기
      </Link>
    </AuthCard>
  )
}
