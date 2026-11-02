import { isAxiosError } from 'axios'
import { redirect } from 'next/navigation'

import { CollectSettingsForm } from '@/components/onboarding/CollectSettingsForm'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'
import { getAccessToken } from '@/lib/auth/api'
import { getCardIssuers, getMailboxes } from '@/lib/onboarding/api'
import type { CardIssuersResponse, MailboxesResponse } from '@/lib/onboarding/types'

export default async function OnboardingCollectPage() {
  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  let mailboxData: MailboxesResponse
  let issuerData: CardIssuersResponse
  try {
    ;[mailboxData, issuerData] = await Promise.all([
      getMailboxes(token),
      getCardIssuers(token),
    ])
  } catch (error) {
    if (
      isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 410)
    ) {
      redirect('/onboarding/mail')
    }
    throw error
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={2} />
        <h1 className="mt-2 text-[28px] font-bold">가져올 명세서 설정</h1>
        <CollectSettingsForm
          email={mailboxData.email}
          mailboxes={mailboxData.mailboxes}
          issuers={issuerData.issuers}
        />
      </div>
    </main>
  )
}
