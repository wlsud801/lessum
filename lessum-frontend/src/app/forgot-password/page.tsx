import { Suspense } from 'react'

import { AuthCard } from '@/components/auth/AuthCard'
import { ForgotPasswordContent } from '@/components/auth/ForgotPasswordContent'

interface ForgotPasswordPageProps {
  searchParams: Promise<{ error?: string }>
}

export default function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  return (
    <AuthCard title="비밀번호 재설정 요청">
      <Suspense fallback={null}>
        <ForgotPasswordContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}
