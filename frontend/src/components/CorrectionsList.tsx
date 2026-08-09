import type { Correction, CorrectionFields } from '../lib/api'
import { formatTimestamp } from '../lib/datetime'
import { StatusDot, formatStatusLabel } from './StatusDot'

const FIELD_LABELS: Record<keyof CorrectionFields, string> = {
  clock_in: 'Clock in',
  clock_out: 'Clock out',
  status: 'Status',
  notes: 'Notes',
}

function formatFieldValue(field: keyof CorrectionFields, value: string | undefined) {
  if (value === undefined || value === null) return '—'
  if (field === 'clock_in' || field === 'clock_out') return formatTimestamp(value)
  if (field === 'status') return formatStatusLabel(value)
  return value
}

function statusVariant(status: Correction['status']) {
  if (status === 'approved') return 'good' as const
  if (status === 'rejected') return 'neutral' as const
  return 'warning' as const
}

export function CorrectionsList({
  corrections,
  showActions = false,
  showRequester = false,
  onApprove,
  onReject,
}: {
  corrections: Correction[]
  showActions?: boolean
  showRequester?: boolean
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}) {
  if (corrections.length === 0) {
    return <p className="font-mono text-sm text-text-muted">No correction requests.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {corrections.map((correction) => (
        <div key={correction.id} className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusDot variant={statusVariant(correction.status)} label={formatStatusLabel(correction.status)} />
              {showRequester && correction.requested_by_name && (
                <span className="font-mono text-xs text-text-muted">{correction.requested_by_name}</span>
              )}
            </div>
            <span className="font-mono text-xs text-text-muted">{formatTimestamp(correction.created_at)}</span>
          </div>
          <p className="mb-2 font-mono text-sm text-text">{correction.reason}</p>
          <div className="mb-3 flex flex-col gap-1 font-mono text-xs text-text-muted">
            {(Object.keys(correction.new_value) as (keyof CorrectionFields)[]).map((field) => (
              <div key={field}>
                {FIELD_LABELS[field]}: {formatFieldValue(field, correction.old_value[field])}
                {' → '}
                <span className="text-text">{formatFieldValue(field, correction.new_value[field])}</span>
              </div>
            ))}
          </div>
          {showActions && correction.status === 'pending' && (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove?.(correction.id)}
                className="rounded-md bg-status-good px-3 py-1 font-mono text-xs font-medium text-bg hover:opacity-90"
              >
                Approve
              </button>
              <button
                onClick={() => onReject?.(correction.id)}
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
