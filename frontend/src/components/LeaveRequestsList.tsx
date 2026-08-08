import type { LeaveRequest } from '../lib/api'
import { StatusDot, calendarStatusToVariant } from './StatusDot'

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function statusVariant(status: LeaveRequest['status']) {
  if (status === 'approved') return 'good' as const
  if (status === 'rejected') return 'neutral' as const
  return 'warning' as const
}

export function LeaveRequestsList({
  requests,
  showActions = false,
  onApprove,
  onReject,
}: {
  requests: LeaveRequest[]
  showActions?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  if (requests.length === 0) {
    return <p className="font-mono text-sm text-text-muted">No leave requests.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <div key={request.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-3">
              <StatusDot variant={statusVariant(request.status)} label={request.status} />
              <StatusDot
                variant={calendarStatusToVariant(request.leave_type === 'sick' ? 'sick_leave' : 'annual_leave')}
                label={request.leave_type === 'sick' ? 'Sick leave' : 'Annual leave'}
              />
            </div>
            <span className="font-mono text-xs text-text-muted">
              {formatDate(request.start_date)} – {formatDate(request.end_date)}
            </span>
          </div>
          <p className="font-mono text-sm text-text">{request.reason}</p>
          {showActions && request.status === 'pending' && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onApprove?.(request.id)}
                className="rounded-md bg-status-good px-3 py-1 font-mono text-xs font-medium text-bg hover:opacity-90"
              >
                Approve
              </button>
              <button
                onClick={() => onReject?.(request.id)}
                className="rounded-md border border-border px-3 py-1 font-mono text-xs text-text-muted hover:text-text"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
