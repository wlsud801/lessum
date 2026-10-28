import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AuthCard } from '@/components/auth/AuthCard'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { buttonVariants } from '@/components/ui/button'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/forgot-password?error=expired')
  }

  return (
    <AuthCard title="새 비밀번호 설정">
      <ResetPasswordForm />
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
