import type { WeekdayLateRate } from '../../lib/api'

export function WeekdayBarChart({ data }: { data: WeekdayLateRate[] }) {
  const maxRate = Math.max(0.01, ...data.map((d) => d.late_rate))

  return (
    <div className="flex items-end gap-3 sm:gap-4" style={{ height: '8rem' }}>
      {data.map((d) => (
        <div key={d.weekday} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="font-mono text-xs text-text-muted">{d.total > 0 ? `${Math.round(d.late_rate * 100)}%` : '—'}</span>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-sm bg-status-warning"
              style={{ height: d.total > 0 ? `${Math.max(4, (d.late_rate / maxRate) * 100)}%` : '2px', opacity: d.total > 0 ? 1 : 0.25 }}
            />
          </div>
          <span className="font-mono text-xs uppercase text-text-muted">{d.weekday.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  )
}
