import { useState, type FormEvent } from 'react'
import type { AttendanceRecord, CorrectionFields } from '../lib/api'
import { addDays, formatTime, localDate, zonedToUtc } from '../lib/datetime'
import { formatStatusLabel } from './StatusDot'
import { TIME_INPUT } from '../lib/timeInput'

const STATUS_OPTIONS: AttendanceRecord['status'][] = ['present', 'late', 'early_leave', 'late_early_leave', 'absent', 'missed_clockout']

const FIELD = 'flex flex-col gap-1.5'
const LABEL = 'text-[13px] text-text-muted'
const INPUT = 'h-11 rounded-[10px] border border-border bg-surface px-3 text-text outline-none focus:border-text focus:shadow-[0_0_0_3px_var(--color-ring)]'

// Inline correction for one attendance record (design B): times are edited
// as wall-clock "HH:MM" in the org's timezone on the record's own day — an
// end time earlier than the start means the shift ran past midnight. Shows
// what will change (old → new) before it's sent for approval.
export function CorrectionForm({
  record,
  dayLabel,
  tz,
  onSubmit,
  onCancel,
}: {
  record: AttendanceRecord
  dayLabel: string
  tz: string
  onSubmit: (reason: string, newValue: CorrectionFields) => Promise<void>
  onCancel: () => void
}) {
  const day = localDate(record.clock_in, tz)
  const originalIn = formatTime(record.clock_in, tz)
  // A missed clock-out carries the closeout job's day-boundary placeholder,
  // not a real time: start the field empty so the real time gets typed in.
  const originalOut = record.clock_out && record.status !== 'missed_clockout' ? formatTime(record.clock_out, tz) : ''
  const [clockIn, setClockIn] = useState(originalIn)
  const [clockOut, setClockOut] = useState(originalOut)
  const [status, setStatus] = useState(record.status)
  const [notes, setNotes] = useState(record.notes ?? '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const changes: { label: string; old: string; new: string }[] = []
  if (clockIn && clockIn !== originalIn) changes.push({ label: 'Clock in', old: originalIn, new: clockIn })
  if (clockOut && clockOut !== originalOut) changes.push({ label: 'Clock out', old: originalOut || '—', new: clockOut })
  if (status !== record.status) changes.push({ label: 'Status', old: formatStatusLabel(record.status), new: formatStatusLabel(status) })
  if (notes !== (record.notes ?? '')) changes.push({ label: 'Notes', old: record.notes || '—', new: notes || '—' })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (changes.length === 0) {
      setError('Change at least one field.')
      return
    }
    if (!reason.trim()) {
      setError('Add a reason for your admin.')
      return
    }
    const newValue: CorrectionFields = {}
    if (clockIn !== originalIn) newValue.clock_in = zonedToUtc(day, clockIn, tz)
    if (clockOut && clockOut !== originalOut) {
      const outDay = clockOut < (clockIn || originalIn) ? addDays(day, 1) : day
      newValue.clock_out = zonedToUtc(outDay, clockOut, tz)
    }
    if (status !== record.status) newValue.status = status
    if (notes !== (record.notes ?? '')) newValue.notes = notes

    setSubmitting(true)
    try {
      await onSubmit(reason, newValue)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the correction')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-3 mb-3 flex flex-col gap-3.5 rounded-xl bg-bg p-[18px] sm:mx-5 sm:mb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="m-0 text-base font-semibold">Correct {dayLabel}</h3>
        <span className="text-xs text-text-muted">Sent to your admin for approval</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-3">
        <label className={FIELD}>
          <span className={LABEL}>Clock in</span>
          <input {...TIME_INPUT} value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={`${INPUT} font-mono text-sm`} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Clock out</span>
          <input {...TIME_INPUT} value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={`${INPUT} font-mono text-sm`} />
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as AttendanceRecord['status'])} className={`${INPUT} px-2.5`}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {formatStatusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD}>
          <span className={LABEL}>Notes</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT} />
        </label>
      </div>
      <label className={FIELD}>
        <span className={LABEL}>Reason</span>
        <textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Forgot to clock out — left the warehouse at 18:10."
          className="resize-y rounded-[10px] border border-border bg-surface px-3 py-2.5 text-text outline-none focus:border-text"
        />
      </label>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[13px]">
          {changes.map((change) => (
            <span key={change.label} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-raised px-2.5 py-1.5">
              {change.label} <span className="font-mono text-text-muted line-through">{change.old}</span>
              <span className="font-mono">{change.new}</span>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="h-11 rounded-[10px] bg-surface-raised px-4">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="h-11 rounded-[10px] bg-action px-5 font-semibold text-on-action disabled:opacity-60">
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </div>
      </div>
    </form>
  )
}
