'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  checkCollectRun,
  submitStatementPassword,
} from '@/lib/settings/actions'
import {
  isBirthDatePassword,
  statementPasswordLabel,
  statementPasswordPlaceholder,
} from '@/lib/settings/statement-password'

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 120000

interface StatementPasswordDialogProps {
  issuer: string
  cardName: string
  statementLabel: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function StatementPasswordDialog({
  issuer,
  cardName,
  statementLabel,
}: StatementPasswordDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [keep, setKeep] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForm() {
    setPassword('')
    setKeep(false)
    setShowConsent(false)
    setError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isSubmitting) {
      return
    }
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const started = await submitStatementPassword(issuer, password, keep)
    if (started.error || !started.runId) {
      setError(
        started.error ?? '암호를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      )
      setIsSubmitting(false)
      return
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS
    for (;;) {
      await sleep(POLL_INTERVAL_MS)

      const run = await checkCollectRun(started.runId)
      if (
        run.error ||
        run.status === 'completed' ||
        run.status === 'failed' ||
        Date.now() > deadline
      ) {
        break
      }
    }

    setIsSubmitting(false)
    setOpen(false)
    resetForm()
    router.refresh()
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger className="flex h-11 shrink-0 cursor-pointer items-center justify-start px-0 text-sm font-bold">
        암호 입력 →
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-20 left-1/2 z-50 flex w-[640px] max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col gap-3.5 rounded-xl border bg-background p-7 shadow-lg outline-none">
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="text-xl font-bold">
              문서 암호 입력
            </Dialog.Title>
            <Dialog.Close
              aria-label="닫기"
              disabled={isSubmitting}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-muted disabled:opacity-50"
            >
              <XIcon className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-5">
            <p className="text-[17px] font-bold">
              {cardName} · {statementLabel}
            </p>
            <p className="text-[15px] text-muted-foreground">
              해당 명세서만 처리 대기 중
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="statement-password" className="text-sm font-bold">
                {statementPasswordLabel(issuer)}
              </Label>
              <Input
                id="statement-password"
                type="password"
                autoComplete="off"
                placeholder={statementPasswordPlaceholder(issuer)}
                className="h-11"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="text-sm">
              {isBirthDatePassword(issuer) ? (
                <p>카드사 웹 명세서 본인인증에 쓰는 주민등록번호 앞 6자리입니다.</p>
              ) : (
                <p>네이버 앱 비밀번호와 다른 암호입니다.</p>
              )}
              <p>암호를 화면이나 로그에 남기지 않습니다.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-normal">
                <Checkbox
                  checked={keep}
                  onCheckedChange={(checked) => {
                    setKeep(checked === true)
                    if (checked === true) {
                      setShowConsent(true)
                    }
                  }}
                  disabled={isSubmitting}
                />
                자동 처리용 암호 보관 (선택)
              </Label>
              <p className="text-[13px] text-muted-foreground">
                보관 선택 시 별도 정보 보관 동의가 필요합니다.
              </p>
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-[160px] font-bold"
                disabled={isSubmitting}
                onClick={() => handleOpenChange(false)}
              >
                나중에
              </Button>
              <Button
                type="submit"
                className="h-11 w-[180px] font-bold"
                disabled={isSubmitting || password.length === 0}
              >
                {isSubmitting ? '처리 중…' : '확인'}
              </Button>
            </div>
          </form>

          <Button
            type="button"
            variant="outline"
            className="h-11 w-full font-bold"
            onClick={() => setShowConsent((prev) => !prev)}
          >
            보관 동의 보기
          </Button>

          {showConsent ? (
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-4 text-[13px] text-muted-foreground">
              <p>보관할 정보: {statementPasswordLabel(issuer)}</p>
              <p>동의한 암호만 서버에서 암호화해 보관하고 자동 처리에만 사용합니다.</p>
              <p>보관한 암호는 도착일·수집 설정에서 언제든 삭제할 수 있습니다.</p>
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
