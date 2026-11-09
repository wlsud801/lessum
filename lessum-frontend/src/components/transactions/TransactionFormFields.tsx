'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { TransactionFormValues } from '@/lib/transactions/form'
import { TYPE_LABELS } from '@/lib/transactions/labels'
import type {
  PaymentMethodItem,
  TransactionType,
} from '@/lib/transactions/types'

interface TransactionFormFieldsProps {
  idPrefix: string
  values: TransactionFormValues
  paymentMethods: PaymentMethodItem[]
  onChange: (patch: Partial<TransactionFormValues>) => void
}

const TYPE_OPTIONS = Object.entries(TYPE_LABELS) as [TransactionType, string][]

export function TransactionFormFields({
  idPrefix,
  values,
  paymentMethods,
  onChange,
}: TransactionFormFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}Type`} className="font-bold">
          유형
        </Label>
        <NativeSelect
          id={`${idPrefix}Type`}
          className="h-11"
          value={values.type}
          onChange={(event) =>
            onChange({ type: event.target.value as TransactionType })
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
        <Label htmlFor={`${idPrefix}Date`} className="font-bold">
          거래일
        </Label>
        <Input
          id={`${idPrefix}Date`}
          type="date"
          className="h-11"
          required
          value={values.date}
          onChange={(event) => onChange({ date: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}Merchant`} className="font-bold">
          거래처
        </Label>
        <Input
          id={`${idPrefix}Merchant`}
          className="h-11"
          placeholder="예: 동네식당"
          maxLength={100}
          required
          value={values.merchant}
          onChange={(event) => onChange({ merchant: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}Amount`} className="font-bold">
          금액 (원)
        </Label>
        <Input
          id={`${idPrefix}Amount`}
          className="h-11"
          inputMode="numeric"
          placeholder="예: 18000"
          required
          value={values.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}Method`} className="font-bold">
          카드·계좌
        </Label>
        <NativeSelect
          id={`${idPrefix}Method`}
          className="h-11"
          value={values.methodId}
          onChange={(event) => onChange({ methodId: event.target.value })}
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
        <Label htmlFor={`${idPrefix}Memo`} className="font-bold">
          메모
        </Label>
        <Input
          id={`${idPrefix}Memo`}
          className="h-11"
          placeholder="선택 입력"
          maxLength={500}
          value={values.memo}
          onChange={(event) => onChange({ memo: event.target.value })}
        />
      </div>
    </div>
  )
}
