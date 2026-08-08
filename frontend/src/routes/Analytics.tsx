import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, type Report, type TeamAnalytics, type UserProfile } from '../lib/api'
import { Header } from '../components/Header'
import { formatTimestamp } from '../lib/datetime'
import { TrendChart } from '../components/charts/TrendChart'
import { DonutChart } from '../components/charts/DonutChart'
import { WeekdayBarChart } from '../components/charts/WeekdayBarChart'

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

export function Analytics() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      if (me.role !== 'admin') return
      const [analyticsData, reportsData] = await Promise.all([api.analytics(), api.reports()])
      setAnalytics(analyticsData)
      setReports(reportsData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  if (profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Attendance trend (last 30 days)
            </h2>
            {analytics && <TrendChart data={analytics.trend} />}
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Status distribution (last 30 days)
            </h2>
            {analytics && (
              <DonutChart
                segments={[
                  { label: 'Present', value: analytics.distribution.present, color: 'var(--color-status-good)' },
                  { label: 'Late', value: analytics.distribution.late, color: 'var(--color-status-warning)' },
                  { label: 'Early leave', value: analytics.distribution.early_leave, color: 'var(--color-status-warning)' },
                  { label: 'Absent', value: analytics.distribution.absent, color: 'var(--color-status-neutral)' },
                  { label: 'Sick leave', value: analytics.distribution.sick_leave, color: 'var(--color-status-info)' },
                  { label: 'Annual leave', value: analytics.distribution.annual_leave, color: 'var(--color-status-leave)' },
                ]}
              />
            )}
          </section>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Team summary
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse whitespace-nowrap font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-2 font-normal sm:px-4">Name</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Present</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Late</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Early leave</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Absent</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Late rate</th>
                </tr>
              </thead>
              <tbody>
                {(!analytics || analytics.users.length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-text-muted">
                      No attendance data yet.
                    </td>
                  </tr>
                )}
                {analytics?.users.map((u) => (
                  <tr key={u.user_id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 text-text sm:px-4">{u.name}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{u.present}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{u.late}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{u.early_leave}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{u.absent}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{formatPct(u.late_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Late rate by weekday
          </h2>
          {analytics && (
            <div className="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
              <WeekdayBarChart data={analytics.by_weekday} />
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse whitespace-nowrap font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-2 font-normal sm:px-4">Weekday</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Records</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Late</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Late rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics?.by_weekday.map((w) => (
                  <tr key={w.weekday} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 text-text sm:px-4">{w.weekday}</td>
                    <td className="px-2 py-2 text-text-muted sm:px-4">{w.total}</td>
                    <td className="px-2 py-2 text-text-muted sm:px-4">{w.late}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{w.total > 0 ? formatPct(w.late_rate) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Scheduled reports
          </h2>
          {reports.length === 0 ? (
            <p className="font-mono text-sm text-text-muted">
              No reports generated yet — the weekly job hasn't run since this org was created.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {reports.map((r) => (
                <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="font-mono text-xs uppercase tracking-wide text-text-muted">{r.type}</span>
                    <span className="font-mono text-xs text-text-muted">{formatTimestamp(r.generated_at)}</span>
                  </div>
                  <p className="font-mono text-sm text-text">
                    {r.payload.org_totals.total_records} records — {r.payload.org_totals.present} present,{' '}
                    {r.payload.org_totals.late} late, {r.payload.org_totals.early_leave} early leave,{' '}
                    {r.payload.org_totals.absent} absent
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
