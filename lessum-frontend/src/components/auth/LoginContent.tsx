import Link from 'next/link'

import { LoginForm } from '@/components/auth/LoginForm'
import { buttonVariants } from '@/components/ui/button'

interface LoginContentProps {
  searchParams: Promise<{ next?: string; reset?: string }>
}

export async function LoginContent({ searchParams }: LoginContentProps) {
  const { next, reset } = await searchParams

  return (
    <>
      <LoginForm next={next} isPasswordReset={reset === 'success'} />
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
    </>
  )
}
