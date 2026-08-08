import { useCallback, useEffect, useState } from 'react'
import { api, type Correction, type LeaveRequest, type UserProfile } from '../lib/api'
import { Header } from '../components/Header'
import { CorrectionsList } from '../components/CorrectionsList'
import { LeaveRequestForm } from '../components/LeaveRequestForm'
import { LeaveRequestsList } from '../components/LeaveRequestsList'

export function Requests() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestingLeave, setRequestingLeave] = useState(false)

  const loadLeaveRequests = useCallback(async () => {
    setLeaveRequests(await api.leaveRequests())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      const [allCorrections, allLeaveRequests] = await Promise.all([api.corrections(), api.leaveRequests()])
      setCorrections(allCorrections)
      setLeaveRequests(allLeaveRequests)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleRequestLeave(leaveType: 'sick' | 'annual', startDate: string, endDate: string, reason: string) {
    await api.requestLeave(leaveType, startDate, endDate, reason)
    setRequestingLeave(false)
    await loadLeaveRequests()
  }

  if (loading && !profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  // Corrections/leave endpoints are RLS-scoped so admins see the whole org's
  // requests, not just their own (that's what Approvals needs) — filter down
  // to "mine" here, same as this page did inline on Dashboard before.
  const myCorrections = corrections.filter((c) => c.requested_by === profile.id)
  const myLeaveRequests = leaveRequests.filter((l) => l.requested_by === profile.id)

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">My Requests</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Leave requests
            </h2>
            {!requestingLeave && (
              <button
                onClick={() => setRequestingLeave(true)}
                className="font-mono text-xs text-text-muted hover:text-text"
              >
                + Request leave
              </button>
            )}
          </div>
          {requestingLeave && (
            <div className="mb-3">
              <LeaveRequestForm onCancel={() => setRequestingLeave(false)} onSubmit={handleRequestLeave} />
            </div>
          )}
          <LeaveRequestsList requests={myLeaveRequests} />
        </section>

        <section>
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Correction requests
          </h2>
          <p className="mb-3 font-mono text-xs text-text-muted">
            To request a correction, use the "Correct" link next to a record in your dashboard history.
          </p>
          <CorrectionsList corrections={myCorrections} />
        </section>
      </main>
    </div>
  )
}
