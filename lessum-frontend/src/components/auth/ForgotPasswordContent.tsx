import Link from 'next/link'

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { buttonVariants } from '@/components/ui/button'

interface ForgotPasswordContentProps {
  searchParams: Promise<{ error?: string }>
}

export async function ForgotPasswordContent({
  searchParams,
}: ForgotPasswordContentProps) {
  const { error } = await searchParams

  return (
    <>
      {error === 'expired' && (
        <Alert variant="destructive">
          <AlertTitle>링크가 만료되었습니다</AlertTitle>
          <AlertDescription>재설정 링크를 다시 받아주세요.</AlertDescription>
        </Alert>
      )}
      <ForgotPasswordForm />
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
    </>
  )
}
