import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, type Correction, type TeamAttendanceRecord, type UserProfile } from '../lib/api'
import { Header } from '../components/Header'
import { StatusDot, statusToVariant } from '../components/StatusDot'
import { CorrectionsList } from '../components/CorrectionsList'
import { formatTimestamp } from '../lib/datetime'

export function Team() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [records, setRecords] = useState<TeamAttendanceRecord[]>([])
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      if (me.role !== 'admin') return
      const [attendance, allCorrections] = await Promise.all([api.teamAttendance(), api.corrections()])
      setRecords(attendance)
      setCorrections(allCorrections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleApprove(id: string) {
    setError(null)
    try {
      await api.approveCorrection(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    }
  }

  async function handleReject(id: string) {
    setError(null)
    try {
      await api.rejectCorrection(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject')
    }
  }

  if (loading && !profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  if (profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  const pendingCorrections = corrections.filter((c) => c.status === 'pending')
  const resolvedCorrections = corrections.filter((c) => c.status !== 'pending')

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Pending corrections
          </h2>
          {loading ? (
            <p className="font-mono text-sm text-text-muted">Loading…</p>
          ) : (
            <CorrectionsList
              corrections={pendingCorrections}
              showActions
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        </section>

        {resolvedCorrections.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Resolved corrections
            </h2>
            <CorrectionsList corrections={resolvedCorrections} />
          </section>
        )}

        <section>
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Team attendance
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Name</th>
                  <th className="px-4 py-2 font-normal">Clock in</th>
                  <th className="px-4 py-2 font-normal">Clock out</th>
                  <th className="px-4 py-2 font-normal">Notes</th>
                </tr>
              </thead>
              <tbody>
                {!loading && records.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                      No records yet.
                    </td>
                  </tr>
                )}
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2">
                      <StatusDot variant={statusToVariant(record.status)} label={record.status} />
                    </td>
                    <td className="px-4 py-2 text-text">{record.user_name}</td>
                    <td className="px-4 py-2 text-text">{formatTimestamp(record.clock_in)}</td>
                    <td className="px-4 py-2 text-text">{formatTimestamp(record.clock_out)}</td>
                    <td className="px-4 py-2 text-text-muted">{record.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}
