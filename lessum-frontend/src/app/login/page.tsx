import { Suspense } from 'react'

import { AuthCard } from '@/components/auth/AuthCard'
import { LoginContent } from '@/components/auth/LoginContent'

interface LoginPageProps {
  searchParams: Promise<{ next?: string; reset?: string }>
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <AuthCard title="로그인">
      <Suspense fallback={null}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  )
}
