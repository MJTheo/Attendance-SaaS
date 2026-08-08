import type { DayStatusCounts } from '../../lib/api'

const SERIES: { key: 'present' | 'late' | 'absent' | 'onLeave'; label: string; color: string }[] = [
  { key: 'present', label: 'Present', color: 'var(--color-status-good)' },
  { key: 'late', label: 'Late', color: 'var(--color-status-warning)' },
  { key: 'absent', label: 'Absent', color: 'var(--color-status-neutral)' },
  { key: 'onLeave', label: 'On leave', color: 'var(--color-status-info)' },
]

const WIDTH = 600
const HEIGHT = 180
const PAD = 24

export function TrendChart({ data }: { data: DayStatusCounts[] }) {
  if (data.length === 0) {
    return <p className="font-mono text-sm text-text-muted">No data yet.</p>
  }

  const points = data.map((d) => ({
    date: d.date,
    present: d.present,
    late: d.late,
    absent: d.absent,
    onLeave: d.sick_leave + d.annual_leave,
  }))

  const maxValue = Math.max(1, ...points.flatMap((p) => SERIES.map((s) => p[s.key])))
  const innerW = WIDTH - PAD * 2
  const innerH = HEIGHT - PAD * 2
  const stepX = points.length > 1 ? innerW / (points.length - 1) : 0

  function x(i: number) {
    return PAD + i * stepX
  }
  function y(value: number) {
    return PAD + innerH - (value / maxValue) * innerH
  }

  function pathFor(key: (typeof SERIES)[number]['key']) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')
  }

  // Show ~5 evenly-spaced x-axis labels rather than one per day.
  const labelEvery = Math.max(1, Math.ceil(points.length / 5))

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Attendance trend over time">
        <line x1={PAD} y1={PAD + innerH} x2={WIDTH - PAD} y2={PAD + innerH} stroke="var(--color-border)" strokeWidth={1} />
        {SERIES.map((s) => (
          <path key={s.key} d={pathFor(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={p.date}
              x={x(i)}
              y={HEIGHT - 4}
              textAnchor="middle"
              className="font-mono"
              style={{ fontSize: '9px', fill: 'var(--color-text-muted)' }}
            >
              {new Date(`${p.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </text>
          ) : null
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-text-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
