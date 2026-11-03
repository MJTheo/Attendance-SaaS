import type { WeekdayLateRate } from '../../lib/api'

const pctLabel = (w: WeekdayLateRate) => (w.total > 0 ? `${Math.round(w.late_rate * 100)}%` : '—')

// Late rate per working weekday: bars scaled to the worst day, with the
// numbers in a table beside them (the bars' text equivalent).
export function WeekdayBarChart({ data }: { data: WeekdayLateRate[] }) {
  const max = Math.max(0.01, ...data.map((w) => w.late_rate))
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-end gap-5">
      <div
        role="img"
        aria-label={`Late rate by weekday: ${data.map((w) => `${w.weekday} ${w.total > 0 ? pctLabel(w) : 'no data'}`).join(', ')}`}
        className="grid h-[170px] items-end gap-3 border-b border-border pb-1"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, data.length)}, minmax(0, 1fr))` }}
      >
        {data.map((w) => (
          <div key={w.weekday} title={`${w.weekday}: ${w.late} late of ${w.total}`} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className="font-mono text-xs">{pctLabel(w)}</span>
            <span
              className={`w-full max-w-12 rounded-[6px_6px_2px_2px] ${w.total > 0 ? 'bg-status-warning' : 'bg-border'}`}
              style={{ height: w.total > 0 ? Math.max(4, Math.round((w.late_rate / max) * 110)) : 2 }}
            />
            <span className="text-xs text-text-muted">{w.weekday.slice(0, 3)}</span>
          </div>
        ))}
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-xs font-semibold text-text-muted">
            <th className="py-1.5 text-left font-semibold">Day</th>
            <th className="py-1.5 text-right font-semibold">Late</th>
            <th className="py-1.5 text-right font-semibold">Records</th>
            <th className="py-1.5 text-right font-semibold">Rate</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {data.map((w) => (
            <tr key={w.weekday} className="border-t border-border">
              <td className="py-2 font-sans">{w.weekday}</td>
              <td className="py-2 text-right">{w.total > 0 ? w.late : '—'}</td>
              <td className="py-2 text-right text-text-muted">{w.total > 0 ? w.total : '—'}</td>
              <td className="py-2 text-right">{pctLabel(w)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
