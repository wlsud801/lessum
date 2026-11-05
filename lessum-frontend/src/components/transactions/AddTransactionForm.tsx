'use client'

import { useRef, useState, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { TransactionFormFields } from '@/components/transactions/TransactionFormFields'
import { Button } from '@/components/ui/button'
import { addTransaction } from '@/lib/transactions/actions'
import {
  buildTransactionPayload,
  emptyTransactionValues,
  type TransactionFormValues,
} from '@/lib/transactions/form'
import type { PaymentMethodItem } from '@/lib/transactions/types'

interface AddTransactionFormProps {
  paymentMethods: PaymentMethodItem[]
}

export function AddTransactionForm({ paymentMethods }: AddTransactionFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [values, setValues] = useState<TransactionFormValues>(
    emptyTransactionValues,
  )
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef<string | null>(null)

  const handleChange = (patch: Partial<TransactionFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSaved(false)

    const result = buildTransactionPayload(values)
    if (!result.ok) {
      setError(result.error)
      return
    }

    requestIdRef.current ??= crypto.randomUUID()
    const clientRequestId = requestIdRef.current

    startTransition(async () => {
      const state = await addTransaction({
        ...result.payload,
        client_request_id: clientRequestId,
      })
      if (state.error) {
        setError(state.error)
        return
      }
      setValues(emptyTransactionValues())
      requestIdRef.current = null
      setIsSaved(true)
    })
  }

  return (
    <div className="rounded-lg border bg-muted/40">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-13 w-full items-center justify-between px-4 py-3"
      >
        <span className="text-[15px] font-bold">거래 추가</span>
        {isOpen ? (
          <ChevronUp className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-4 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 border-t bg-background p-4"
        >
          <TransactionFormFields
            idPrefix="add"
            values={values}
            paymentMethods={paymentMethods}
            onChange={handleChange}
          />

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {isSaved && !error && (
            <p role="status" className="text-sm text-muted-foreground">
              거래가 추가되었습니다.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              className="h-11 w-[144px] font-bold"
              disabled={isPending}
            >
              {isPending ? '저장 중…' : '추가'}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
