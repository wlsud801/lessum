import { Suspense } from 'react'

import { AuthCard } from '@/components/auth/AuthCard'
import { ResetPasswordContent } from '@/components/auth/ResetPasswordContent'

export default function ResetPasswordPage() {
  return (
    <AuthCard title="새 비밀번호 설정">
      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>
    </AuthCard>
  )
}
