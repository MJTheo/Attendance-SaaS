import type { AttendanceRecord, CalendarStatus } from '../lib/api'

// Five meaning groups (design direction B): good = present/approved, warning =
// late/early leave/missed clock-out/pending, neutral = absent/rejected, plus
// one colour each for sick and annual leave. Colour never stands alone: every
// status also has its own icon and its label, so the three warning states
// (which share a colour) stay distinguishable and colour-blind safe.
export type DotVariant = 'good' | 'warning' | 'neutral' | 'sick' | 'annual'

const VARIANT_OF: Record<string, DotVariant> = {
  present: 'good',
  late: 'warning',
  early_leave: 'warning',
  missed_clockout: 'warning',
  absent: 'neutral',
  sick_leave: 'sick',
  annual_leave: 'annual',
  pending: 'warning',
  approved: 'good',
  rejected: 'neutral',
  awaiting: 'warning',
}

// 16×16 stroke paths, from the design's status icon set.
const ICON_PATH: Record<string, string> = {
  present: 'M3.5 8.5l3 3 6-7',
  late: 'M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11zM8 5v3.3l2.2 1.4',
  early_leave: 'M9.5 3H4v10h5.5M7.5 8h6M11 5.5L13.5 8 11 10.5',
  missed_clockout: 'M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11zM6 6l4 4M10 6l-4 4',
  absent: 'M4 8h8',
  sick_leave: 'M8 4v8M4 8h8',
  annual_leave:
    'M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
  pending: 'M4 8h.01M8 8h.01M12 8h.01',
  approved: 'M3.5 8.5l3 3 6-7',
  rejected: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  awaiting: 'M2.5 4h11v8h-11zM2.5 4.5L8 9l5.5-4.5',
}

const ICON_COLOR: Record<DotVariant, string> = {
  good: 'text-status-good',
  warning: 'text-status-warning',
  neutral: 'text-status-neutral',
  sick: 'text-status-sick',
  annual: 'text-status-annual',
}

const TINT: Record<DotVariant, string> = {
  good: 'bg-status-good-bg',
  warning: 'bg-status-warning-bg',
  neutral: 'bg-status-neutral-bg',
  sick: 'bg-status-sick-bg',
  annual: 'bg-status-annual-bg',
}

export function statusToVariant(status: AttendanceRecord['status']): DotVariant {
  return VARIANT_OF[status] ?? 'neutral'
}

export function calendarStatusToVariant(status: CalendarStatus): DotVariant {
  return VARIANT_OF[status] ?? 'neutral'
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
  awaiting: 'Approved — email not confirmed yet',
}

export function formatStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

export function StatusIcon({ status, size = 14, className = '' }: { status: string; size?: number; className?: string }) {
  const variant = VARIANT_OF[status] ?? 'neutral'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${ICON_COLOR[variant]} ${className}`}
    >
      <path d={ICON_PATH[status] ?? ICON_PATH.absent} />
    </svg>
  )
}

/**
 * The design's status chip: a tinted pill with the status's own icon and its
 * label. `status` picks the icon (and, unless `variant` is given, the colour
 * group); `label` defaults to the status's display name.
 */
export function StatusDot({ status, label, variant }: { status: string; label?: string; variant?: DotVariant }) {
  const group = variant ?? VARIANT_OF[status] ?? 'neutral'
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full pl-[9px] pr-3 font-sans text-[13px] font-medium text-text ${TINT[group]}`}
    >
      <StatusIcon status={status} />
      {label ?? formatStatusLabel(status)}
    </span>
  )
}
