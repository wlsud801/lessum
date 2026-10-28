import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMe } from '@/lib/auth/api'
import { logout } from '@/lib/auth/actions'

export default async function HomePage() {
  const me = await getMe()

  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-[90px]">
      <Card className="w-full max-w-[520px]">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">홈</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p>이메일: {me?.email}</p>
          <p>시간대: {me?.profile.timezone}</p>
          <ul>
            {me?.consents.map((consent) => (
              <li key={consent.consent_type}>
                {consent.consent_type} {consent.version} · {consent.agreed_at}
              </li>
            ))}
          </ul>
          <form action={logout}>
            <Button type="submit" variant="outline" size="lg">
              로그아웃
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
