import type { Correction, CorrectionFields, LeaveRequest } from './api'
import type { RequestField } from '../components/RequestCard'
import { formatStatusLabel } from '../components/StatusDot'
import { formatDateRange, formatDateTime, formatDayLong, formatTime, localDate } from './datetime'

// Turns API rows into what a request card shows: a title, a meta line
// ("Sent Nov 2, 08:40" / "Approved by Ben Reyes · Oct 23, 09:02") and each
// changed field as old → new — all in the org's timezone.

function meta(status: string, createdAt: string, resolvedAt: string | null, approver: string | null, tz: string): string {
  if (status === 'pending' || !resolvedAt) return `Sent ${formatDateTime(createdAt, tz)}`
  const verb = status === 'approved' ? 'Approved' : 'Rejected'
  return `${verb}${approver ? ` by ${approver}` : ''} · ${formatDateTime(resolvedAt, tz)}`
}

export function leaveCard(request: LeaveRequest, tz: string) {
  return {
    title: request.leave_type === 'sick' ? 'Sick leave' : 'Annual leave',
    meta: meta(request.status, request.created_at, request.resolved_at, request.approved_by_name, tz),
    status: request.status,
    fields: [{ label: 'Dates', new: formatDateRange(request.start_date, request.end_date) }] as RequestField[],
    reason: request.reason,
  }
}

const CORRECTION_LABEL: Record<keyof CorrectionFields, string> = {
  clock_in: 'Clock in',
  clock_out: 'Clock out',
  status: 'Status',
  notes: 'Notes',
}

function correctionValue(field: keyof CorrectionFields, value: string | null | undefined, tz: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'clock_in' || field === 'clock_out') return formatTime(value, tz)
  if (field === 'status') return formatStatusLabel(value)
  return value
}

export function correctionCard(correction: Correction, tz: string) {
  const fields = (Object.keys(correction.new_value) as (keyof CorrectionFields)[]).map((field) => ({
    label: CORRECTION_LABEL[field],
    old: correctionValue(field, correction.old_value[field], tz),
    new: correctionValue(field, correction.new_value[field], tz),
  }))
  return {
    title: correction.record_clock_in ? formatDayLong(localDate(correction.record_clock_in, tz)) : 'Correction',
    meta: meta(correction.status, correction.created_at, correction.resolved_at, correction.approved_by_name, tz),
    status: correction.status,
    fields,
    reason: correction.reason,
  }
}
