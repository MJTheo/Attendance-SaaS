import type { ProfileEditRequest, ProfileFields } from '../lib/api'
import { formatTimestamp } from '../lib/datetime'
import { StatusDot, formatStatusLabel } from './StatusDot'

const FIELD_LABELS: Record<keyof ProfileFields, string> = {
  name: 'Name',
  email: 'Email',
}

function statusVariant(request: ProfileEditRequest) {
  if (request.awaiting_email_confirmation) return 'warning' as const
  if (request.status === 'approved') return 'good' as const
  if (request.status === 'rejected') return 'neutral' as const
  return 'warning' as const
}

function statusLabel(request: ProfileEditRequest) {
  return request.awaiting_email_confirmation ? 'Approved — email not confirmed yet' : formatStatusLabel(request.status)
}

export function ProfileEditsList({
  requests,
  showActions = false,
  showRequester = false,
  onApprove,
  onReject,
}: {
  requests: ProfileEditRequest[]
  showActions?: boolean
  showRequester?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  if (requests.length === 0) {
    return <p className="font-mono text-sm text-text-muted">No profile change requests.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((request) => (
        <div key={request.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-3">
              <StatusDot variant={statusVariant(request)} label={statusLabel(request)} />
              {showRequester && request.user_name && (
                <span className="font-mono text-xs text-text-muted">{request.user_name}</span>
              )}
            </div>
            <span className="font-mono text-xs text-text-muted">{formatTimestamp(request.created_at)}</span>
          </div>
          <p className="mb-2 font-mono text-sm text-text">{request.reason}</p>
          <div className="flex flex-col gap-1 font-mono text-xs text-text-muted">
            {(Object.keys(request.new_value) as (keyof ProfileFields)[]).map((field) => (
              <div key={field} className="break-all">
                {FIELD_LABELS[field]}: {request.old_value[field] ?? '—'}
                {' → '}
                <span className="text-text">{request.new_value[field]}</span>
              </div>
            ))}
          </div>
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
