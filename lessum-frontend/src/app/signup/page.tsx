import { AuthCard } from '@/components/auth/AuthCard'
import { SignupForm } from '@/components/auth/SignupForm'

export default function SignupPage() {
  return (
    <AuthCard title="회원가입">
      <SignupForm />
    </AuthCard>
  )
}
