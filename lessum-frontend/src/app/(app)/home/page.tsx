import { Suspense } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getMe } from '@/lib/auth/api'
import { logout } from '@/lib/auth/actions'

export default function HomePage() {
  return (
    <div className="flex flex-1 items-start justify-center">
      <Card className="w-full max-w-[520px]">
        <CardHeader>
          <CardTitle className="text-3xl font-bold">홈</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <Suspense fallback={<p className="text-muted-foreground">불러오는 중...</p>}>
            <MeInfo />
          </Suspense>
          <form action={logout}>
            <Button type="submit" variant="outline" size="lg">
              로그아웃
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

async function MeInfo() {
  const me = await getMe()

  return (
    <>
      <p>이메일: {me?.email}</p>
      <p>시간대: {me?.profile.timezone}</p>
      <ul>
        {me?.consents.map((consent) => (
          <li key={consent.consent_type}>
            {consent.consent_type} {consent.version} · {consent.agreed_at}
          </li>
        ))}
      </ul>
    </>
  )
}
