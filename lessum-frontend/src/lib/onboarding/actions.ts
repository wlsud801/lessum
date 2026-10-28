'use server'

import { redirect } from 'next/navigation'

import { completeOnboarding } from './api'

export async function finishOnboarding() {
  await completeOnboarding()
  redirect('/home')
}
