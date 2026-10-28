export interface AuthActionState {
  error?: string
  message?: string
}

export interface MeResponse {
  id: string
  email?: string
  profile: {
    id: string
    timezone: string
    onboarded_at: string | null
    created_at: string
    updated_at: string
  }
  consents: {
    consent_type: 'terms' | 'privacy'
    version: string
    agreed_at: string
  }[]
}
