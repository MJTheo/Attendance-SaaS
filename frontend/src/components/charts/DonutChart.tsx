import { StatusIcon, formatStatusLabel } from '../StatusDot'

export interface DonutSegment {
  status: string
  value: number
  // A status colour token, e.g. var(--color-status-good)
  color: string
}

// Status mix as a ring (design B) with the list beside it: each status's
// icon, label, count and share — so the ring is never read by colour alone.
export function DonutChart({ segments }: { segments: DonutSegment[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0)

  let acc = 0
  const stops = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const from = acc
      acc += (s.value / total) * 100
      return `${s.color} ${from.toFixed(2)}% ${acc.toFixed(2)}%`
    })
  const ring = stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--color-surface-raised)'

  return (
    <div className="flex flex-wrap items-center gap-[22px]">
      <div
        role="img"
        aria-label={`Status distribution: ${segments
          .filter((s) => s.value)
          .map((s) => `${formatStatusLabel(s.status)} ${pct(s.value)}%`)
          .join(', ') || 'no records'}`}
        className="flex h-40 w-40 flex-none items-center justify-center rounded-full"
        style={{ background: ring }}
      >
        <div className="flex h-[104px] w-[104px] flex-col items-center justify-center rounded-full bg-surface">
          <span className="font-mono text-[22px] font-medium">{total}</span>
          <span className="text-xs text-text-muted">records</span>
        </div>
      </div>
      <div className="flex flex-[1_1_180px] flex-col gap-1.5">
        {segments.map((s) => (
          <div key={s.status} className="grid grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2 text-[13px]">
            <StatusIcon status={s.status} />
            <span>{formatStatusLabel(s.status)}</span>
            <span className="font-mono text-text-muted">{s.value}</span>
            <span className="w-11 text-right font-mono">{pct(s.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
