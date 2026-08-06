import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, type Report, type TeamAnalytics, type UserProfile } from '../lib/api'
import { Header } from '../components/Header'
import { formatTimestamp } from '../lib/datetime'

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

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Team summary
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Present</th>
                  <th className="px-4 py-2 font-normal">Late</th>
                  <th className="px-4 py-2 font-normal">Early leave</th>
                  <th className="px-4 py-2 font-normal">Absent</th>
                  <th className="px-4 py-2 font-normal">Late rate</th>
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
                    <td className="px-4 py-2 text-text">{u.name}</td>
                    <td className="px-4 py-2 text-text">{u.present}</td>
                    <td className="px-4 py-2 text-text">{u.late}</td>
                    <td className="px-4 py-2 text-text">{u.early_leave}</td>
                    <td className="px-4 py-2 text-text">{u.absent}</td>
                    <td className="px-4 py-2 text-text">{formatPct(u.late_rate)}</td>
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-4 py-2 font-normal">Weekday</th>
                  <th className="px-4 py-2 font-normal">Records</th>
                  <th className="px-4 py-2 font-normal">Late</th>
                  <th className="px-4 py-2 font-normal">Late rate</th>
                </tr>
              </thead>
              <tbody>
                {analytics?.by_weekday.map((w) => (
                  <tr key={w.weekday} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-text">{w.weekday}</td>
                    <td className="px-4 py-2 text-text-muted">{w.total}</td>
                    <td className="px-4 py-2 text-text-muted">{w.late}</td>
                    <td className="px-4 py-2 text-text">{w.total > 0 ? formatPct(w.late_rate) : '—'}</td>
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
                  <div className="mb-2 flex items-center justify-between">
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
