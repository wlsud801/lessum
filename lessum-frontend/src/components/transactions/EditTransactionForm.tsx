'use client'

import { useState, useTransition } from 'react'
import { X } from 'lucide-react'

import { TransactionFormFields } from '@/components/transactions/TransactionFormFields'
import { Button } from '@/components/ui/button'
import { updateTransaction } from '@/lib/transactions/actions'
import {
  buildTransactionPayload,
  toTransactionValues,
  type TransactionFormValues,
} from '@/lib/transactions/form'
import type {
  PaymentMethodItem,
  TransactionItem,
} from '@/lib/transactions/types'

interface EditTransactionFormProps {
  transaction: TransactionItem
  paymentMethods: PaymentMethodItem[]
  onClose: () => void
}

export function EditTransactionForm({
  transaction,
  paymentMethods,
  onClose,
}: EditTransactionFormProps) {
  const [values, setValues] = useState<TransactionFormValues>(() =>
    toTransactionValues(transaction),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleChange = (patch: Partial<TransactionFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const result = buildTransactionPayload(values)
    if (!result.ok) {
      setError(result.error)
      return
    }

    startTransition(async () => {
      const state = await updateTransaction(transaction.id, result.payload)
      if (state.error) {
        setError(state.error)
        return
      }
      onClose()
    })
  }

  return (
    <div className="rounded-lg border">
      <div className="flex h-13 items-center justify-between px-4 py-2">
        <span className="text-[15px] font-bold">
          거래 수정 · {transaction.merchant_name ?? '거래'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="거래 수정 닫기"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 border-t p-4"
      >
        <TransactionFormFields
          idPrefix="edit"
          values={values}
          paymentMethods={paymentMethods}
          onChange={handleChange}
        />

        {transaction.requires_review && (
          <p className="text-sm text-muted-foreground">
            저장하면 이 거래의 확인 필요 표시가 해제됩니다.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-[100px]"
            onClick={onClose}
          >
            취소
          </Button>
          <Button
            type="submit"
            className="h-11 w-[144px] font-bold"
            disabled={isPending}
          >
            {isPending ? '저장 중…' : '저장'}
          </Button>
        </div>
      </form>
    </div>
  )
}
