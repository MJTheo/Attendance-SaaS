import type { AttendanceRecord, CalendarStatus } from '../lib/api'

// teal = good/present, amber = warning/late, slate = neutral/inactive,
// sky = sick leave, violet = annual leave.
export type DotVariant = 'good' | 'warning' | 'neutral' | 'info' | 'leave'

const dotClasses: Record<DotVariant, string> = {
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
  leave: 'bg-status-leave',
}

export function statusToVariant(status: AttendanceRecord['status']): DotVariant {
  switch (status) {
    case 'present':
      return 'good'
    case 'late':
    case 'early_leave':
    case 'missed_clockout':
      return 'warning'
    case 'absent':
      return 'neutral'
  }
}

export function calendarStatusToVariant(status: CalendarStatus): DotVariant {
  if (status === 'sick_leave') return 'info'
  if (status === 'annual_leave') return 'leave'
  return statusToVariant(status)
}

// Curated over algorithmic: a generic snake_case -> Title Case pass would
// render "missed_clockout" as "Missed Clockout" instead of "Missed
// clock-out" — this covers every attendance/calendar/workflow status used
// across the app in one place, in the app's sentence-case style, with an
// underscores-to-spaces fallback for anything not (yet) listed here.
const STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  late: 'Late',
  early_leave: 'Early leave',
  absent: 'Absent',
  missed_clockout: 'Missed clock-out',
  sick_leave: 'Sick leave',
  annual_leave: 'Annual leave',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

export function StatusDot({ variant, label }: { variant: DotVariant; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClasses[variant]}`} aria-hidden="true" />
      {label && <span className="font-mono text-sm text-text-muted">{label}</span>}
    </span>
  )
}
