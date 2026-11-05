'use client'

import { useRef, useState, useTransition } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { addTransaction } from '@/lib/transactions/actions'
import { TYPE_LABELS } from '@/lib/transactions/labels'
import type {
  PaymentMethodItem,
  TransactionType,
} from '@/lib/transactions/types'

interface AddTransactionFormProps {
  paymentMethods: PaymentMethodItem[]
}

const TYPE_OPTIONS = Object.entries(TYPE_LABELS) as [TransactionType, string][]

function today() {
  return new Date().toLocaleDateString('en-CA')
}

export function AddTransactionForm({ paymentMethods }: AddTransactionFormProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState<TransactionType>('ACCOUNT_EXPENSE')
  const [date, setDate] = useState(today)
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [methodId, setMethodId] = useState('')
  const [memo, setMemo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const requestIdRef = useRef<string | null>(null)

  const resetForm = () => {
    setType('ACCOUNT_EXPENSE')
    setDate(today())
    setMerchant('')
    setAmount('')
    setMethodId('')
    setMemo('')
    requestIdRef.current = null
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSaved(false)

    const parsedAmount = Number(amount.replaceAll(',', '').trim())
    if (!merchant.trim()) {
      setError('거래처를 입력해주세요.')
      return
    }
    if (!Number.isSafeInteger(parsedAmount) || parsedAmount <= 0) {
      setError('금액은 1원 이상의 정수로 입력해주세요.')
      return
    }

    requestIdRef.current ??= crypto.randomUUID()

    startTransition(async () => {
      const result = await addTransaction({
        transaction_type: type,
        transaction_date: date,
        merchant_name: merchant.trim(),
        amount: parsedAmount,
        payment_method_id: methodId || null,
        memo: memo.trim() || null,
        client_request_id: requestIdRef.current as string,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      resetForm()
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addType" className="font-bold">
                유형
              </Label>
              <NativeSelect
                id="addType"
                className="h-11"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as TransactionType)
                }
              >
                {TYPE_OPTIONS.map(([itValue, itLabel]) => (
                  <option key={itValue} value={itValue}>
                    {itLabel}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addDate" className="font-bold">
                거래일
              </Label>
              <Input
                id="addDate"
                type="date"
                className="h-11"
                required
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addMerchant" className="font-bold">
                거래처
              </Label>
              <Input
                id="addMerchant"
                className="h-11"
                placeholder="예: 동네식당"
                maxLength={100}
                required
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addAmount" className="font-bold">
                금액 (원)
              </Label>
              <Input
                id="addAmount"
                className="h-11"
                inputMode="numeric"
                placeholder="예: 18000"
                required
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addMethod" className="font-bold">
                카드·계좌
              </Label>
              <NativeSelect
                id="addMethod"
                className="h-11"
                value={methodId}
                onChange={(event) => setMethodId(event.target.value)}
              >
                <option value="">선택 안 함</option>
                {paymentMethods.map((itMethod) => (
                  <option key={itMethod.id} value={itMethod.id}>
                    {itMethod.nickname}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5 lg:col-span-3">
              <Label htmlFor="addMemo" className="font-bold">
                메모
              </Label>
              <Input
                id="addMemo"
                className="h-11"
                placeholder="선택 입력"
                maxLength={500}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
              />
            </div>
          </div>

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
