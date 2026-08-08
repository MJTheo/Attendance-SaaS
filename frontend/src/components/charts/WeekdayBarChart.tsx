import type { WeekdayLateRate } from '../../lib/api'

// Fixed pixel track height — percentage heights don't reliably resolve
// inside a flex child whose own height comes from flex distribution rather
// than an explicit value, which is what caused bars to render as one solid
// block instead of proportional heights.
const TRACK_HEIGHT = 96

export function WeekdayBarChart({ data }: { data: WeekdayLateRate[] }) {
  const maxRate = Math.max(0.01, ...data.map((d) => d.late_rate))

  return (
    <div className="flex items-end gap-3 sm:gap-4">
      {data.map((d) => {
        const barHeight = d.total > 0 ? Math.max(4, (d.late_rate / maxRate) * TRACK_HEIGHT) : 2
        return (
          <div key={d.weekday} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-xs text-text-muted">
              {d.total > 0 ? `${Math.round(d.late_rate * 100)}%` : '—'}
            </span>
            <div className="flex w-full items-end justify-center" style={{ height: TRACK_HEIGHT }}>
              <div
                className="w-full rounded-t-sm bg-status-warning"
                style={{ height: barHeight, opacity: d.total > 0 ? 1 : 0.25 }}
              />
            </div>
            <span className="font-mono text-xs uppercase text-text-muted">{d.weekday.slice(0, 3)}</span>
          </div>
        )
      })}
    </div>
  )
}
