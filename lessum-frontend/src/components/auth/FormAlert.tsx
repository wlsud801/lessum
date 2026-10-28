import { Alert, AlertDescription } from '@/components/ui/alert'
import type { AuthActionState } from '@/lib/auth/types'

export function FormAlert({ error, message }: AuthActionState) {
  if (!error && !message) {
    return null
  }
  return (
    <Alert variant={error ? 'destructive' : 'default'} role="alert">
      <AlertDescription>{error ?? message}</AlertDescription>
    </Alert>
  )
}
