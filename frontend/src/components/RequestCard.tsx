import type { ReactNode } from 'react'
import { StatusDot } from './StatusDot'

export interface RequestField {
  label: string
  // Absent for fields that only have a new value (e.g. leave dates).
  old?: string
  new: string
}

// One request — leave, correction or profile change — in the design's card:
// title + meta, status chip, each field as old → new, and the reason.
export function RequestCard({
  title,
  meta,
  status,
  fields,
  reason,
  actions,
}: {
  title: ReactNode
  meta: ReactNode
  status: string
  fields: RequestField[]
  reason: string
  actions?: ReactNode
}) {
  return (
    <article className="flex flex-col gap-3 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-base font-semibold [overflow-wrap:anywhere]">{title}</span>
          <span className="text-[13px] text-text-muted">{meta}</span>
        </div>
        <StatusDot status={status} />
      </div>
      {fields.map((field) => (
        <div
          key={field.label}
          className="grid grid-cols-1 items-baseline gap-x-3 gap-y-0.5 rounded-[10px] bg-bg px-3 py-2.5 text-sm sm:grid-cols-[110px_minmax(0,1fr)]"
        >
          <span className="text-[13px] text-text-muted">{field.label}</span>
          <span className="[overflow-wrap:anywhere]">
            {field.old !== undefined && (
              <>
                <span className="font-mono text-[13px] text-text-muted line-through">{field.old}</span> →{' '}
              </>
            )}
            <span className="font-semibold">{field.new}</span>
          </span>
        </div>
      ))}
      <div className="text-sm">
        <span className="text-text-muted">Reason: </span>
        {reason}
      </div>
      {actions}
    </article>
  )
}

export function EmptyCard({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2.5 rounded-[16px] bg-surface p-[22px]">
      <span className="text-base font-semibold">{title}</span>
      <span className="text-sm text-text-muted">{body}</span>
      {children}
    </div>
  )
}
