import Link from 'next/link'

import { AuthCard } from '@/components/auth/AuthCard'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SignupPage() {
  return (
    <AuthCard title="회원가입">
      <form className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="email@example.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="비밀번호를 입력하세요"
          />
          <p className="text-xs text-muted-foreground">
            인증 서비스의 비밀번호 정책 안내
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
          <Input
            id="passwordConfirm"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            placeholder="같은 비밀번호를 다시 입력하세요"
          />
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Checkbox id="terms" />
            <Label htmlFor="terms">
              [필수]
              <Link href="/terms" className="font-bold underline">
                이용약관
              </Link>
              에 동의합니다
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="privacy" />
            <Label htmlFor="privacy">
              [필수]
              <Link href="/privacy" className="font-bold underline">
                개인정보 안내
              </Link>
              를 확인했습니다
            </Label>
          </div>
        </div>
        <Button type="submit" size="lg" className="w-[210px]">
          가입하기
        </Button>
      </form>
    </AuthCard>
  )
}
