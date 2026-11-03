import type { DayStatusCounts } from '../../lib/api'

const H = 180

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
}

// Share of the team that clocked in, per day that has anything recorded
// (present_rate comes from the API; non-working days are null and skipped).
// One series, so no legend — the card's title names it. Each point has a
// hover target with its date and value.
export function TrendChart({ data }: { data: DayStatusCounts[] }) {
  const days = data.filter((d): d is DayStatusCounts & { present_rate: number } => d.present_rate !== null)
  if (days.length === 0) {
    return <p className="m-0 text-sm text-text-muted">No working days recorded in the last 30 days yet.</p>
  }

  const pct = days.map((d) => Math.round(d.present_rate * 100))
  // The design's 50–100 scale reads small dips clearly; widen to 0–100 if
  // any day falls below it rather than clipping the line.
  const lo = Math.min(...pct) >= 50 ? 50 : 0
  const points = pct.map((p, i) => ({
    x: days.length > 1 ? (i / (days.length - 1)) * 100 : 50,
    y: ((100 - p) / (100 - lo)) * 100,
  }))
  const shown = days.length <= 3 ? points.map((_, i) => i) : [points.length - 1]

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-2">
        <div className="flex flex-col justify-between text-right font-mono text-[11px] text-text-muted" style={{ height: H }}>
          <span>100</span>
          <span>{(100 + lo) / 2}</span>
          <span>{lo}</span>
        </div>
        <div className="relative" style={{ height: H }}>
          <div className="absolute inset-x-0 top-0 border-t border-border" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" />
          <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          <svg
            role="img"
            aria-label={`Line chart of the share of the team clocked in per working day, ${pct[0]}% to ${pct[pct.length - 1]}%`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--color-status-good)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {points.map((p, i) => (
            <span
              key={days[i].date}
              title={`${shortDate(days[i].date)} · ${pct[i]}% clocked in`}
              className="group absolute -ml-2 -mt-2 flex h-4 w-4 items-center justify-center"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full bg-status-good ${shown.includes(i) ? '' : 'opacity-0 group-hover:opacity-100'}`}
              />
            </span>
          ))}
        </div>
      </div>
      <div className="flex justify-between pl-[42px] font-mono text-[11px] text-text-muted">
        <span>{shortDate(days[0].date)}</span>
        <span>{shortDate(days[days.length - 1].date)}</span>
      </div>
    </div>
  )
}
