import { useState, type ReactNode } from 'react'
import { StatusDot, StatusIcon } from './StatusDot'

export interface PendingItem {
  id: string
  who: string
  meta: string
  // The request itself: old → new fields, or a profile diff.
  body: ReactNode
  reason: string
}

export interface ResolvedItem {
  id: string
  who: string
  summary: string
  status: string
}

// An admin's review queue (design B, approvals screens): "Waiting for you"
// cards with Reject / Approve, an "All caught up" state, a confirmation
// toast after each decision, and the resolved requests underneath.
export function ApprovalQueue({
  heading,
  pending,
  resolved,
  emptyTitle,
  emptyBody,
  onDecide,
  toastFor,
}: {
  heading: string
  pending: PendingItem[]
  resolved: ResolvedItem[]
  emptyTitle: string
  emptyBody: string
  onDecide: (id: string, approve: boolean) => Promise<void>
  toastFor: (item: PendingItem, approved: boolean) => string
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(item: PendingItem, approve: boolean) {
    setError(null)
    setToast(null)
    setBusyId(item.id)
    try {
      await onDecide(item.id, approve)
      setToast(toastFor(item, approve))
    } catch (err) {
      // e.g. "Another admin has to review your own profile change"
      setError(err instanceof Error ? err.message : 'Failed to update the request')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {toast && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-status-good-bg px-3.5 py-3 text-sm">
          <StatusIcon status="approved" size={15} />
          {toast}
        </div>
      )}
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-signal-soft px-3.5 py-3 text-sm">
          {error}
        </p>
      )}
      <h2 className="m-0 text-base font-semibold">
        {heading} <span className="font-mono font-medium text-text-muted">{pending.length}</span>
      </h2>
      {pending.map((item) => (
        <article key={item.id} className="flex flex-col gap-3 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="text-base font-semibold [overflow-wrap:anywhere]">{item.who}</span>
              <span className="text-[13px] text-text-muted">{item.meta}</span>
            </div>
            <StatusDot status="pending" />
          </div>
          {item.body}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              <span className="text-text-muted">Reason: </span>
              {item.reason}
            </span>
            <div className="flex flex-[1_1_100%] gap-2 sm:flex-none">
              <button
                type="button"
                onClick={() => decide(item, false)}
                disabled={busyId !== null}
                className="h-[46px] flex-1 rounded-[10px] bg-surface-raised px-[18px] disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => decide(item, true)}
                disabled={busyId !== null}
                className="h-[46px] flex-1 rounded-[10px] bg-action px-[22px] font-semibold text-on-action disabled:opacity-60"
              >
                {busyId === item.id ? 'Saving…' : 'Approve'}
              </button>
            </div>
          </div>
        </article>
      ))}
      {pending.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-[16px] bg-surface p-[22px]">
          <span className="inline-flex items-center gap-2 text-base font-semibold">
            <StatusIcon status="approved" size={16} />
            {emptyTitle}
          </span>
          <span className="text-sm text-text-muted">{emptyBody}</span>
        </div>
      )}

      <h2 className="mb-0 mt-2.5 text-base font-semibold">Resolved</h2>
      <div className="rounded-[16px] bg-surface">
        {resolved.length === 0 && <div className="px-4 py-5 text-sm text-text-muted sm:px-5">Nothing resolved yet.</div>}
        {resolved.map((item) => (
          <div
            key={item.id}
            className="grid min-h-[54px] grid-cols-1 items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-sm last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:px-5"
          >
            <span className="font-semibold [overflow-wrap:anywhere]">{item.who}</span>
            <span className="text-text-muted [overflow-wrap:anywhere]">{item.summary}</span>
            <span className="justify-self-start">
              <StatusDot status={item.status} />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
