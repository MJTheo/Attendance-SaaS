import { useState, type FormEvent } from 'react'
import type { AttendanceRecord, CorrectionFields } from '../lib/api'
import { formatStatusLabel } from './StatusDot'
import { fromDatetimeLocal, toDatetimeLocal } from '../lib/datetime'

const STATUS_OPTIONS: AttendanceRecord['status'][] = [
  'present',
  'late',
  'early_leave',
  'absent',
  'missed_clockout',
]

export function CorrectionRequestForm({
  record,
  onSubmit,
  onCancel,
}: {
  record: AttendanceRecord
  onSubmit: (reason: string, newValue: CorrectionFields) => Promise<void>
  onCancel: () => void
}) {
  const [reason, setReason] = useState('')
  const [clockIn, setClockIn] = useState(toDatetimeLocal(record.clock_in))
  const [clockOut, setClockOut] = useState(toDatetimeLocal(record.clock_out))
  const [status, setStatus] = useState(record.status)
  const [notes, setNotes] = useState(record.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    // Compare in datetime-local space (minute precision), not ISO space —
    // round-tripping an ISO timestamp with seconds through a datetime-local
    // input and back would otherwise always look "changed" by a few seconds.
    const newValue: CorrectionFields = {}
    if (clockIn && clockIn !== toDatetimeLocal(record.clock_in)) {
      newValue.clock_in = fromDatetimeLocal(clockIn)
    }
    if (clockOut !== toDatetimeLocal(record.clock_out)) {
      if (clockOut) newValue.clock_out = fromDatetimeLocal(clockOut)
    }
    if (status !== record.status) newValue.status = status
    if (notes !== (record.notes ?? '')) newValue.notes = notes

    if (Object.keys(newValue).length === 0) {
      setError('Change at least one field')
      return
    }
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(reason, newValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit correction')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border bg-bg p-4">
      {error && <p className="mb-3 font-mono text-xs text-status-warning">{error}</p>}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Clock in</span>
          <input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-status-good"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Clock out</span>
          <input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-status-good"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceRecord['status'])}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-status-good"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Notes</span>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-status-good"
          />
        </label>
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-status-good"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-status-good px-3 py-1.5 font-mono text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit correction'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-text-muted hover:text-text"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
