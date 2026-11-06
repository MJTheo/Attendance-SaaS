import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, isAdmin, type Report, type TeamAnalytics } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { formatDateRange, formatDateTime, localDate } from '../lib/datetime'
import { TrendChart } from '../components/charts/TrendChart'
import { DonutChart } from '../components/charts/DonutChart'
import { WeekdayBarChart } from '../components/charts/WeekdayBarChart'
import { WeeklyByPerson, WeeklyChart } from '../components/charts/WeeklyChart'

// Distribution order and colour per status (design B's five meaning groups).
const DISTRIBUTION: { key: keyof TeamAnalytics['distribution']; color: string }[] = [
  { key: 'present', color: 'var(--color-status-good)' },
  { key: 'late', color: 'var(--color-status-warning)' },
  { key: 'early_leave', color: 'var(--color-status-warning)' },
  { key: 'late_early_leave', color: 'var(--color-status-warning)' },
  { key: 'missed_clockout', color: 'var(--color-status-warning)' },
  { key: 'absent', color: 'var(--color-status-neutral)' },
  { key: 'sick_leave', color: 'var(--color-status-sick)' },
  { key: 'annual_leave', color: 'var(--color-status-annual)' },
]

// Fewer working days than this and the trend can't say much yet.
const SPARSE_DAYS = 10
// A late rate at or above this is called out in the team summary.
const LATE_RATE_FLAG = 0.2

const pct = (rate: number) => `${Math.round(rate * 100)}%`

export function Analytics() {
  const { me } = useMe()
  const tz = me.org_timezone
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [analyticsData, reportsData] = await Promise.all([api.analytics(), api.reports()])
      setAnalytics(analyticsData)
      setReports(reportsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (isAdmin(me)) load()
  }, [me, load])

  if (!isAdmin(me)) return <Navigate to="/" replace />

  const trend = analytics?.trend ?? []
  const sub = trend.length ? `Last 30 days · ${formatDateRange(trend[0].date, trend[trend.length - 1].date)}` : 'Last 30 days'
  const workingDays = trend.filter((d) => d.present_rate !== null).length

  return (
    <Page title="Analytics" sub={sub}>
      {!loaded ? (
        <Skeleton />
      ) : error || !analytics ? (
        <LoadError message={error ?? undefined} onRetry={load} />
      ) : (
        <div className="flex flex-col gap-[18px]">
          {workingDays < SPARSE_DAYS && (
            <div role="note" className="flex items-start gap-2.5 rounded-xl bg-surface px-4 py-3.5 text-sm leading-normal">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mt-[3px] flex-none text-text-muted">
                <path d="M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
              </svg>
              {workingDays === 0
                ? 'No working days recorded in the last 30 days yet. Charts fill in as your team clocks in.'
                : `Only ${workingDays} working day${workingDays === 1 ? '' : 's'} of data so far. Charts fill in as days add up; trends become meaningful after about two weeks.`}
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
            <section aria-labelledby="trend-heading" className="flex flex-col gap-3 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2.5">
                <h2 id="trend-heading" className="m-0 text-base font-semibold">
                  Attendance, last 30 days
                </h2>
                <span className="text-[13px] text-text-muted">Present, % of team per working day</span>
              </div>
              <TrendChart data={trend} />
            </section>

            <section aria-labelledby="dist-heading" className="flex flex-col gap-3.5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
              <h2 id="dist-heading" className="m-0 text-base font-semibold">
                Status distribution
              </h2>
              <DonutChart segments={DISTRIBUTION.map(({ key, color }) => ({ status: key, value: analytics.distribution[key], color }))} />
            </section>
          </div>

          <section aria-labelledby="weekday-heading" className="flex flex-col gap-3.5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <h2 id="weekday-heading" className="m-0 text-base font-semibold">
                Late rate by weekday
              </h2>
              <span className="text-[13px] text-text-muted">Working days only</span>
            </div>
            <WeekdayBarChart data={analytics.by_weekday} />
          </section>

          <section aria-labelledby="weeks-heading" className="flex flex-col gap-3.5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <h2 id="weeks-heading" className="m-0 text-base font-semibold">
                By week
              </h2>
              <span className="text-[13px] text-text-muted">Last {analytics.weeks.length} weeks, Monday to Sunday</span>
            </div>
            <WeeklyChart weeks={analytics.weeks} />
          </section>

          <section aria-labelledby="people-weeks-heading" className="flex flex-col rounded-[16px] bg-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px] sm:px-5">
              <h2 id="people-weeks-heading" className="m-0 text-base font-semibold">
                By person
              </h2>
              <span className="text-[13px] text-text-muted">Absences and early leaves per week</span>
            </div>
            <WeeklyByPerson people={analytics.weeks_by_person} weeks={analytics.weeks} />
          </section>

          <section aria-labelledby="summary-heading" className="flex flex-col rounded-[16px] bg-surface">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5 px-4 pb-2.5 pt-[18px] sm:px-5">
              <h2 id="summary-heading" className="m-0 text-base font-semibold">
                Team summary
              </h2>
              <span className="font-mono text-xs text-text-muted">Last 30 days · {analytics.users.length} people</span>
            </div>
            <div className={`overflow-auto ${analytics.users.length > 15 ? 'max-h-[520px]' : ''}`}>
              <div className="min-w-[880px]">
                <div className="sticky top-0 z-[1] grid h-10 grid-cols-[minmax(200px,1.6fr)_repeat(7,minmax(0,1fr))] items-center gap-2.5 border-b border-border bg-surface px-4 text-xs font-semibold text-text-muted sm:px-5">
                  <span>Name</span>
                  <span className="text-right">Present</span>
                  <span className="text-right">Late</span>
                  <span className="text-right">Early leave</span>
                  <span className="text-right">Late & early</span>
                  <span className="text-right">Missed clock-out</span>
                  <span className="text-right">Absent</span>
                  <span className="text-right">Late rate</span>
                </div>
                {analytics.users.length === 0 && <div className="px-4 py-5 text-sm text-text-muted sm:px-5">No attendance data yet.</div>}
                {analytics.users.map((u) => (
                  <div
                    key={u.user_id}
                    className="grid min-h-11 grid-cols-[minmax(200px,1.6fr)_repeat(7,minmax(0,1fr))] items-center gap-2.5 border-b border-border px-4 font-mono text-[13px] last:border-b-0 sm:px-5"
                  >
                    <span className="truncate font-sans text-sm">{u.name}</span>
                    <span className="text-right">{u.present}</span>
                    <span className="text-right">{u.late}</span>
                    <span className="text-right">{u.early_leave}</span>
                    <span className="text-right">{u.late_early_leave}</span>
                    <span className="text-right">{u.missed_clockout}</span>
                    <span className="text-right">{u.absent}</span>
                    <span className={`text-right ${u.late_rate >= LATE_RATE_FLAG ? 'font-semibold text-status-warning' : ''}`}>{pct(u.late_rate)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section aria-labelledby="reports-heading" className="flex flex-col gap-2.5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
            <h2 id="reports-heading" className="m-0 text-base font-semibold">
              Weekly reports
            </h2>
            {reports.length === 0 ? (
              <span className="text-sm text-text-muted">No reports generated yet — the weekly job hasn't run since this org was created.</span>
            ) : (
              reports.map((r) => <ReportRow key={r.id} report={r} tz={tz} />)
            )}
          </section>
        </div>
      )}
    </Page>
  )
}

function ReportRow({ report, tz }: { report: Report; tz: string }) {
  const [open, setOpen] = useState(false)
  const { period_start, period_end, org_totals: t } = report.payload
  return (
    <div className="flex flex-col border-t border-border">
      <div className="flex min-h-[52px] items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-sm font-medium">Week of {formatDateRange(localDate(period_start, tz), localDate(period_end, tz))}</span>
          <span className="font-mono text-xs text-text-muted">Generated {formatDateTime(report.generated_at, tz)}</span>
        </span>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="h-10 rounded-[10px] bg-surface-raised px-3.5 text-[13px]">
          {open ? 'Close' : 'Open'}
        </button>
      </div>
      {open && (
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 rounded-[10px] bg-bg px-3 py-2.5 font-mono text-[13px]">
          <span>
            {t.total_records} <span className="font-sans text-text-muted">records</span>
          </span>
          <span>
            {t.present} <span className="font-sans text-text-muted">present</span>
          </span>
          <span>
            {t.late} <span className="font-sans text-text-muted">late</span>
          </span>
          <span>
            {t.early_leave} <span className="font-sans text-text-muted">early leave</span>
          </span>
          <span>
            {t.absent} <span className="font-sans text-text-muted">absent</span>
          </span>
        </div>
      )}
    </div>
  )
}
