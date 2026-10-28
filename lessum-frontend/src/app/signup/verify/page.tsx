import Link from 'next/link'

import { AuthCard } from '@/components/auth/AuthCard'
import { ResendConfirmationForm } from '@/components/auth/ResendConfirmationForm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

interface SignupVerifyPageProps {
  searchParams: Promise<{ email?: string; error?: string }>
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) {
    return ''
  }
  return `${local[0]}***@${domain}`
}

export default async function SignupVerifyPage({
  searchParams,
}: SignupVerifyPageProps) {
  const { email = '', error } = await searchParams

  return (
    <AuthCard title="이메일 확인">
      <Alert>
        <AlertTitle>이메일을 확인해주세요</AlertTitle>
        <AlertDescription>
          {maskEmail(email)}
          <br />
          메일의 확인 링크를 열어주세요.
        </AlertDescription>
      </Alert>
      {error === 'expired' && (
        <Alert variant="destructive">
          <AlertTitle>링크가 만료되었습니다</AlertTitle>
          <AlertDescription>확인 메일을 다시 받아주세요.</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-3">
        <ResendConfirmationForm email={email} />
        <Link
          href="/login"
          className={buttonVariants({ variant: 'outline', size: 'lg' })}
        >
          로그인으로
        </Link>
      </div>
    </AuthCard>
  )
}
