import { Suspense } from 'react'

import { AuthCard } from '@/components/auth/AuthCard'
import { SignupVerifyContent } from '@/components/auth/SignupVerifyContent'

interface SignupVerifyPageProps {
  searchParams: Promise<{ email?: string; error?: string }>
}

export default function SignupVerifyPage({
  searchParams,
}: SignupVerifyPageProps) {
  return (
    <AuthCard title="이메일 확인">
      <Suspense fallback={null}>
        <SignupVerifyContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}
