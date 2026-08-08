const SIZE = 140
const STROKE = 20
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface DonutSegment {
  label: string
  value: number
  color: string
}

export function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)

  if (total === 0) {
    return <p className="font-mono text-sm text-text-muted">No data yet.</p>
  }

  let offset = 0
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const fraction = s.value / total
      const dash = fraction * CIRCUMFERENCE
      const arc = { ...s, dash, offset }
      offset += dash
      return arc
    })

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Status distribution">
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-border)" strokeWidth={STROKE} />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={STROKE}
              strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </g>
      </svg>
      <div className="flex flex-col gap-1.5 font-mono text-xs text-text-muted">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="text-text">{s.label}</span>
              <span>
                {s.value} ({Math.round((s.value / total) * 100)}%)
              </span>
            </span>
          ))}
      </div>
    </div>
  )
}
