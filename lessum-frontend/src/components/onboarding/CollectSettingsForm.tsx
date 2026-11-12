'use client'

import Link from 'next/link'
import { startTransition, useActionState, useState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { NoticeBox } from '@/components/onboarding/NoticeBox'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { saveCollectSettings } from '@/lib/onboarding/actions'
import {
  formatDisplayDate,
  nextCollectDate,
  todayInKst,
} from '@/lib/onboarding/collect-schedule'
import type {
  ArrivalDay,
  CardIssuer,
  CollectSettingsPayload,
  Mailbox,
} from '@/lib/onboarding/types'
import {
  statementPasswordLabel,
  statementPasswordPlaceholder,
} from '@/lib/settings/statement-password'

interface CollectSettingsFormProps {
  email: string
  mailboxes: Mailbox[]
  issuers: CardIssuer[]
}

const ARRIVAL_DAYS = [
  ...Array.from({ length: 31 }, (_, index) => ({
    value: String(index + 1),
    label: `매월 ${index + 1}일`,
  })),
  { value: 'last', label: '매월 말일' },
]

const CELL_CLASS = 'px-2.5 py-1.5 text-sm'

function toArrivalDay(value: string): ArrivalDay {
  return value === 'last' ? 'last' : Number(value)
}

export function CollectSettingsForm({
  email,
  mailboxes,
  issuers,
}: CollectSettingsFormProps) {
  const [today] = useState(() => todayInKst())
  const [mailboxImapName, setMailboxImapName] = useState(
    mailboxes[0]?.imap_name ?? '',
  )
  const [startDate, setStartDate] = useState(`${today.slice(0, 8)}01`)
  const [selectedIds, setSelectedIds] = useState<string[]>(
    issuers.filter((issuer) => issuer.supported).map((issuer) => issuer.id),
  )
  const [arrivalDays, setArrivalDays] = useState<Record<string, string>>({})
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [state, dispatch, isPending] = useActionState(saveCollectSettings, {})

  const passwordIssuers = issuers.filter(
    (issuer) =>
      issuer.needs_statement_password && selectedIds.includes(issuer.id),
  )
  const canSubmit =
    selectedIds.length > 0 && mailboxImapName !== '' && startDate !== ''

  const handleToggleCard = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((itRow) => itRow !== id),
    )
  }

  const handleChangeArrivalDay = (id: string, arrivalDay: string) => {
    setArrivalDays((prev) => ({ ...prev, [id]: arrivalDay }))
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const payload: CollectSettingsPayload = {
      mailboxImapName,
      startDate,
      cards: issuers
        .filter((issuer) => selectedIds.includes(issuer.id))
        .map((issuer) => {
          const password = passwords[issuer.id]
          return {
            issuer: issuer.id,
            arrivalDay: toArrivalDay(arrivalDays[issuer.id] ?? 'last'),
            ...(issuer.needs_statement_password && password
              ? { statementPassword: password }
              : {}),
          }
        }),
    }
    startTransition(() => {
      dispatch(payload)
    })
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <NoticeBox lines={[`메일 연결 성공 · ${email}`]} />
      <FormAlert error={state.error} />
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="mailbox" className="font-bold">
            수집할 메일함 *
          </Label>
          <NativeSelect
            id="mailbox"
            name="mailbox"
            className="h-11"
            value={mailboxImapName}
            onChange={(event) => setMailboxImapName(event.target.value)}
          >
            {mailboxes.map((itRow) => (
              <option key={itRow.imap_name} value={itRow.imap_name}>
                {itRow.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="startDate" className="font-bold">
            가져오기 시작일 *
          </Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            max={today}
            className="h-11"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
      </div>
      <p className="text-[13px]">
        접속한 메일 서버에서 조회한 실제 메일함 중 선택합니다.
      </p>
      <h2 className="text-lg font-bold">
        카드사와 명세서 도착 예정일을 선택해주세요.
      </h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
          <caption className="sr-only">카드별 명세서 도착일 설정</caption>
          <colgroup>
            <col className="w-[60px]" />
            <col className="w-[180px]" />
            <col className="w-[240px]" />
            <col />
          </colgroup>
          <thead className="bg-muted text-[13px] font-bold">
            <tr>
              <th scope="col" className={CELL_CLASS}>선택</th>
              <th scope="col" className={CELL_CLASS}>카드사 / 명세서</th>
              <th scope="col" className={CELL_CLASS}>명세서 도착 예정일 *</th>
              <th scope="col" className={CELL_CLASS}>다음 자동 조회</th>
            </tr>
          </thead>
          <tbody>
            {issuers.map((issuer) => {
              const isSelected = selectedIds.includes(issuer.id)
              const arrivalDay = arrivalDays[issuer.id] ?? 'last'
              return (
                <tr key={issuer.id} className="align-top">
                  <td className={CELL_CLASS}>
                    {issuer.supported ? (
                      <Checkbox
                        aria-label={`${issuer.name} 선택`}
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleToggleCard(issuer.id, checked)
                        }
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={CELL_CLASS}>{issuer.name}</td>
                  <td className={CELL_CLASS}>
                    {issuer.supported ? (
                      <NativeSelect
                        aria-label={`${issuer.name} 도착 예정일`}
                        className="h-11"
                        value={arrivalDay}
                        disabled={!isSelected}
                        onChange={(event) =>
                          handleChangeArrivalDay(issuer.id, event.target.value)
                        }
                      >
                        {ARRIVAL_DAYS.map((itDay) => (
                          <option key={itDay.value} value={itDay.value}>
                            {itDay.label}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      '현재 미지원'
                    )}
                  </td>
                  <td className={CELL_CLASS}>
                    {issuer.supported && isSelected
                      ? formatDisplayDate(
                          nextCollectDate(toArrivalDay(arrivalDay), today),
                        )
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <NoticeBox
        lines={[
          '매월 설정한 날짜에 메일을 조회해 명세서를 등록합니다.',
          '도착일은 1~31일 또는 말일로 선택합니다. 해당 날짜가 없는 달은 말일에 조회합니다.',
        ]}
      />
      {passwordIssuers.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">
            선택한 카드의 명세서 암호 (필요한 경우)
          </h2>
          {passwordIssuers.map((issuer) => (
            <div key={issuer.id} className="flex flex-col gap-1.5">
              <Label htmlFor={`statementPassword-${issuer.id}`} className="font-bold">
                {issuer.name} {statementPasswordLabel(issuer.id)}
              </Label>
              <Input
                id={`statementPassword-${issuer.id}`}
                name={`statementPassword-${issuer.id}`}
                type="password"
                autoComplete="off"
                placeholder={statementPasswordPlaceholder(issuer.id)}
                className="h-11"
                value={passwords[issuer.id] ?? ''}
                onChange={(event) =>
                  setPasswords((prev) => ({
                    ...prev,
                    [issuer.id]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            메일 앱 비밀번호와 다른 암호입니다. 필요한 카드에만 입력받습니다.
          </p>
        </div>
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="h-11 w-[150px] font-bold"
          nativeButton={false}
          render={<Link href="/onboarding/mail" />}
        >
          이전
        </Button>
        <Button
          type="submit"
          className="h-11 w-[300px] font-bold"
          disabled={!canSubmit || isPending}
        >
          {isPending ? '수집 설정 저장 중…' : '자동 등록 설정으로'}
        </Button>
      </div>
    </form>
  )
}
