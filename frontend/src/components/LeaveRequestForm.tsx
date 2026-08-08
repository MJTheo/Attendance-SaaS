import { useState, type FormEvent } from 'react'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function LeaveRequestForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (leaveType: 'sick' | 'annual', startDate: string, endDate: string, reason: string) => Promise<void>
  onCancel: () => void
}) {
  const [leaveType, setLeaveType] = useState<'sick' | 'annual'>('sick')
  const [startDate, setStartDate] = useState(today())
  const [endDate, setEndDate] = useState(today())
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (endDate < startDate) {
      setError('End date must be on or after start date')
      return
    }
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }

    setSubmitting(true)
    try {
      await onSubmit(leaveType, startDate, endDate, reason)
      setReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit leave request')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-4 sm:p-6">
      {error && <p className="mb-3 font-mono text-xs text-status-warning">{error}</p>}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Type</span>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value as 'sick' | 'annual')}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-status-good"
          >
            <option value="sick">Sick leave</option>
            <option value="annual">Annual leave</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Start date</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-status-good"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">End date</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-sm text-text outline-none focus:border-status-good"
          />
        </label>
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Reason</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text outline-none focus:border-status-good"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-status-good px-3 py-1.5 font-mono text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Request leave'}
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
