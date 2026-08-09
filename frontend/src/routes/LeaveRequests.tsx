import { useCallback, useEffect, useState } from 'react'
import { api, type LeaveRequest, type UserProfile } from '../lib/api'
import { AppShell } from '../components/AppShell'
import { LeaveRequestForm } from '../components/LeaveRequestForm'
import { LeaveRequestsList } from '../components/LeaveRequestsList'

export function LeaveRequests() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
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
      await loadLeaveRequests()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [loadLeaveRequests])

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

  // The endpoint is RLS-scoped so admins see the whole org's requests, not
  // just their own (that's what Leave Approvals needs) — filter to "mine".
  const myLeaveRequests = leaveRequests.filter((l) => l.requested_by === profile.id)

  return (
    <AppShell profile={profile}>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-sans text-lg font-semibold text-text">Leave requests</h1>
          {!requestingLeave && (
            <button
              onClick={() => setRequestingLeave(true)}
              className="font-mono text-xs text-text-muted hover:text-text"
            >
              + Request leave
            </button>
          )}
        </div>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        {requestingLeave && (
          <div className="mb-4">
            <LeaveRequestForm onCancel={() => setRequestingLeave(false)} onSubmit={handleRequestLeave} />
          </div>
        )}
        <LeaveRequestsList requests={myLeaveRequests} />
      </main>
    </AppShell>
  )
}
