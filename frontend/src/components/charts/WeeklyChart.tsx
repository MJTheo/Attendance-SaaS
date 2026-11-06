import type { PersonWeeks, WeekSummary } from '../../lib/api'
import { formatWeek } from '../../lib/datetime'
import { StatusIcon, formatStatusLabel } from '../StatusDot'

// The two exceptions the weekly views track, each in its own status colour
// and always shown with its icon and label (never colour alone). Days that
// were late and left early count as early leaves here.
const SERIES = [
  { key: 'absent', bar: 'bg-status-neutral' },
  { key: 'early_leave', bar: 'bg-status-warning' },
] as const

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))

const weekLabel = (w: { week_start: string }, partial: boolean) => (partial ? 'This week' : shortDate(w.week_start))

// Stacked on narrow screens ("Oct" over "5") so eight labels fit at 390px.
function WeekTick({ w, partial }: { w: { week_start: string }; partial: boolean }) {
  const [first, second] = weekLabel(w, partial).split(' ')
  return (
    <span className="flex flex-col items-center leading-tight sm:flex-row sm:justify-center sm:gap-1">
      <span>{first}</span>
      <span>{second}</span>
    </span>
  )
}

const CELL_WORD = { absent: 'absent', early_leave: 'early' } as const

function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-[13px]">
      {SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <StatusIcon status={s.key} />
          {formatStatusLabel(s.key)}
        </span>
      ))}
    </div>
  )
}

// Absences and early leaves per week for the whole team (grouped bars, one
// scale), with the full weekly counts in a table beside them.
export function WeeklyChart({ weeks: raw }: { weeks: WeekSummary[] }) {
  const weeks = raw.map((w) => ({ ...w, early_leave: w.early_leave + w.late_early_leave }))
  const max = Math.max(1, ...weeks.flatMap((w) => [w.absent, w.early_leave]))
  return (
    <div className="flex flex-col gap-4">
      <Legend />
      <div
        role="img"
        aria-label={`Absent and early leave per week: ${weeks
          .map((w) => `week of ${shortDate(w.week_start)} ${w.absent} absent, ${w.early_leave} early leave`)
          .join('; ')}`}
        className="grid h-[150px] items-end gap-2 border-b border-border pb-1"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((w) => (
          <div key={w.week_start} className="flex h-full items-end justify-center gap-[3px]">
            {SERIES.map((s) => (
              <div
                key={s.key}
                title={`Week of ${formatWeek(w.week_start)}: ${w[s.key]} ${formatStatusLabel(s.key).toLowerCase()}`}
                className="flex h-full w-full max-w-5 flex-col items-center justify-end gap-1"
              >
                {w[s.key] > 0 && <span className="font-mono text-[11px]">{w[s.key]}</span>}
                <span
                  className={`w-full rounded-[4px_4px_1px_1px] ${w[s.key] > 0 ? s.bar : 'bg-border'}`}
                  style={{ height: w[s.key] > 0 ? Math.max(4, Math.round((w[s.key] / max) * 110)) : 2 }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="-mt-2 grid gap-2 text-center font-mono text-[11px] text-text-muted" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((w) => (
          <WeekTick key={w.week_start} w={w} partial={w.partial} />
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="text-xs font-semibold text-text-muted">
              <th className="py-1.5 text-left font-semibold">Week</th>
              <th className="py-1.5 text-right font-semibold">Present rate</th>
              <th className="py-1.5 text-right font-semibold">Late</th>
              <th className="py-1.5 text-right font-semibold">Early leave</th>
              <th className="py-1.5 text-right font-semibold">Late & early</th>
              <th className="py-1.5 text-right font-semibold">Missed clock-out</th>
              <th className="py-1.5 text-right font-semibold">Absent</th>
              <th className="py-1.5 text-right font-semibold">On leave</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {[...raw].reverse().map((w) => {
              const empty = w.present_rate === null
              const n = (v: number) => (empty ? '—' : v)
              return (
                <tr key={w.week_start} className="border-t border-border">
                  <td className="py-2 font-sans">
                    {formatWeek(w.week_start)}
                    {w.partial && <span className="text-text-muted"> · so far</span>}
                  </td>
                  <td className="py-2 text-right">{empty ? '—' : `${Math.round((w.present_rate ?? 0) * 100)}%`}</td>
                  <td className="py-2 text-right">{n(w.late)}</td>
                  <td className="py-2 text-right">{n(w.early_leave)}</td>
                  <td className="py-2 text-right">{n(w.late_early_leave)}</td>
                  <td className="py-2 text-right">{n(w.missed_clockout)}</td>
                  <td className="py-2 text-right">{n(w.absent)}</td>
                  <td className="py-2 text-right">{n(w.sick_leave + w.annual_leave)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// The same two exceptions per person per week: who is absent or leaving
// early, and when. A dash means neither happened that week.
export function WeeklyByPerson({ people, weeks }: { people: PersonWeeks[]; weeks: WeekSummary[] }) {
  const columns = `minmax(160px,1.4fr) repeat(${weeks.length}, minmax(84px,1fr))`
  return (
    <div className="flex flex-col gap-3">
      <div className="px-4 sm:px-5">
        <Legend />
      </div>
      <div className={`overflow-auto ${people.length > 15 ? 'max-h-[520px]' : ''}`}>
        <div className="min-w-[880px]">
          <div
            className="sticky top-0 z-[1] grid h-10 items-center gap-2 border-b border-border bg-surface px-4 text-xs font-semibold text-text-muted sm:px-5"
            style={{ gridTemplateColumns: columns }}
          >
            <span className="sticky left-0 bg-surface">Name</span>
            {weeks.map((w) => (
              <span key={w.week_start} className="font-mono font-medium">
                {weekLabel(w, w.partial)}
              </span>
            ))}
          </div>
          {people.map((p) => (
            <div
              key={p.user_id}
              className="grid min-h-11 items-center gap-2 border-b border-border px-4 last:border-b-0 sm:px-5"
              style={{ gridTemplateColumns: columns }}
            >
              <span className="sticky left-0 truncate bg-surface text-sm">{p.name}</span>
              {p.weeks.map((w) => (
                <span
                  key={w.week_start}
                  title={`Week of ${formatWeek(w.week_start)}: ${w.absent} absent, ${w.early_leave} early leave`}
                  className="flex flex-col gap-0.5 py-1.5 text-xs"
                >
                  {w.absent === 0 && w.early_leave === 0 ? (
                    <span className="font-mono text-text-muted">—</span>
                  ) : (
                    SERIES.filter((s) => w[s.key] > 0).map((s) => (
                      <span key={s.key} className="inline-flex items-center gap-1 whitespace-nowrap">
                        <StatusIcon status={s.key} size={13} />
                        <span className="font-mono">{w[s.key]}</span> {CELL_WORD[s.key]}
                      </span>
                    ))
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
