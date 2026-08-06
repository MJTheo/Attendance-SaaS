import type { AttendanceRecord } from '../lib/api'

// Only three status colors exist in this product's design language:
// teal = good/present, amber = warning/late, slate = neutral/inactive.
export type DotVariant = 'good' | 'warning' | 'neutral'

const dotClasses: Record<DotVariant, string> = {
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  neutral: 'bg-status-neutral',
}

export function statusToVariant(status: AttendanceRecord['status']): DotVariant {
  switch (status) {
    case 'present':
      return 'good'
    case 'late':
    case 'early_leave':
      return 'warning'
    case 'absent':
      return 'neutral'
  }
}

export function StatusDot({ variant, label }: { variant: DotVariant; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dotClasses[variant]}`} aria-hidden="true" />
      {label && <span className="font-mono text-sm text-text-muted">{label}</span>}
    </span>
  )
}
