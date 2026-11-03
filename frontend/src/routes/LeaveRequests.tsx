import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type LeaveRequest } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { EmptyCard, RequestCard } from '../components/RequestCard'
import { StatusIcon } from '../components/StatusDot'
import { leaveCard } from '../lib/requests'
import { localDate } from '../lib/datetime'

const INPUT = 'rounded-[10px] border border-border bg-bg px-3 text-text outline-none focus:border-text'

export function LeaveRequests() {
  const { me } = useMe()
  const tz = me.org_timezone
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setLeaveRequests(await api.leaveRequests())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The endpoint is RLS-scoped so admins see the whole org's requests, not
  // just their own (that's what Leave Approvals needs) — filter to "mine".
  const mine = leaveRequests.filter((l) => l.requested_by === me.id)

  return (
    <Page title="Leave" sub="Your requests" maxWidth={980}>
      {!loaded ? (
        <Skeleton />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <LeaveForm today={localDate(new Date(), tz)} onSent={load} />
          <section aria-labelledby="mine-heading" className="flex min-w-0 flex-[1.4_1_380px] flex-col gap-3">
            <h2 id="mine-heading" className="m-0 text-base font-semibold">
              Your requests
            </h2>
            {mine.length === 0 ? (
              <EmptyCard title="No leave requests yet" body="Use the form to send your first one. Its status shows up here." />
            ) : (
              mine.map((request) => <RequestCard key={request.id} {...leaveCard(request, tz)} />)
            )}
          </section>
        </div>
      )}
    </Page>
  )
}

function LeaveForm({ today, onSent }: { today: string; onSent: () => Promise<void> }) {
  const [leaveType, setLeaveType] = useState<'annual' | 'sick'>('annual')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSent(false)
    if (endDate < startDate) {
      setError('The end date must be on or after the start date.')
      return
    }
    if (!reason.trim()) {
      setError('Add a short reason for your admin.')
      return
    }
    setSubmitting(true)
    try {
      await api.requestLeave(leaveType, startDate, endDate, reason)
      setReason('')
      setSent(true)
      await onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="leave-form-heading" className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
      <h2 id="leave-form-heading" className="m-0 text-lg font-semibold">
        Request leave
      </h2>
      {sent && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-status-good-bg p-3 text-sm">
          <StatusIcon status="approved" size={15} />
          Request sent. Your admin will see it in their Inbox.
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-text-muted">Type</span>
          <div role="group" aria-label="Leave type" className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
            {(['annual', 'sick'] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={leaveType === type}
                onClick={() => setLeaveType(type)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-[9px] ${
                  leaveType === type ? 'bg-action font-semibold text-on-action' : 'text-text-muted'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path
                    d={
                      type === 'annual'
                        ? 'M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1'
                        : 'M8 4v8M4 8h8'
                    }
                  />
                </svg>
                {type === 'annual' ? 'Annual' : 'Sick'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-muted">Start</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={`${INPUT} h-[46px] font-mono text-[13px]`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-muted">End</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className={`${INPUT} h-[46px] font-mono text-[13px]`} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-text-muted">Reason</span>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="A short note for your admin"
            className={`${INPUT} resize-y py-2.5`}
          />
        </label>
        {error && (
          <p role="alert" className="m-0 text-[13px] text-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className="h-12 rounded-xl bg-action text-[15px] font-semibold text-on-action disabled:opacity-60">
          {submitting ? 'Sending…' : 'Send request'}
        </button>
      </form>
    </section>
  )
}
