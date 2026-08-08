import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { api, type Correction, type OrgSettings, type TeamAttendanceRecord, type UserProfile } from '../lib/api'
import { DEMO_ADMIN_EMAIL } from '../lib/demo'
import { Header } from '../components/Header'
import { StatusDot, statusToVariant } from '../components/StatusDot'
import { CorrectionsList } from '../components/CorrectionsList'
import { formatTimestamp } from '../lib/datetime'

const WORKING_DAYS_LABEL: Record<number, string> = {
  5: '5 days/week (Mon–Fri)',
  6: '6 days/week (Mon–Sat)',
  7: '7 days/week (Mon–Sun)',
}

export function Team() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [records, setRecords] = useState<TeamAttendanceRecord[]>([])
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      if (me.role !== 'admin') return
      const [attendance, allCorrections, settings] = await Promise.all([
        api.teamAttendance(),
        api.corrections(),
        api.orgSettings(),
      ])
      setRecords(attendance)
      setCorrections(allCorrections)
      setOrgSettings(settings)
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

  async function handleWorkingDaysChange(event: ChangeEvent<HTMLSelectElement>) {
    const workingDays = Number(event.target.value) as 5 | 6 | 7
    setError(null)
    setSavingSettings(true)
    try {
      const updated = await api.updateOrgSettings(workingDays)
      setOrgSettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleInvite(event: FormEvent) {
    event.preventDefault()
    setInviteError(null)
    setInviteSuccess(null)
    setInviting(true)
    try {
      await api.inviteStaff(inviteEmail, inviteName)
      setInviteSuccess(`Invite sent to ${inviteEmail}`)
      setInviteEmail('')
      setInviteName('')
    } catch (err) {
      // The backend's detail message is already specific (already registered,
      // rate limited, etc.) — surface it as-is rather than re-classifying by status.
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviting(false)
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

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        {orgSettings && (
          <section className="mb-8 rounded-lg border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Organization settings
            </h2>
            <label className="block">
              <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">
                Working days
              </span>
              {profile.email !== DEMO_ADMIN_EMAIL ? (
                <select
                  value={orgSettings.working_days}
                  onChange={handleWorkingDaysChange}
                  disabled={savingSettings}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good disabled:opacity-50 sm:w-auto"
                >
                  {[5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {WORKING_DAYS_LABEL[n]}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="font-mono text-sm text-text">{WORKING_DAYS_LABEL[orgSettings.working_days]}</p>
              )}
            </label>
            <p className="mt-2 font-mono text-xs text-text-muted">
              Controls which weekdays show up in analytics and which days count toward streaks.
            </p>
          </section>
        )}

        {profile.email !== DEMO_ADMIN_EMAIL && (
          <section className="mb-8 rounded-lg border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Invite staff
            </h2>
            {inviteError && <p className="mb-3 font-mono text-xs text-status-warning">{inviteError}</p>}
            {inviteSuccess && <p className="mb-3 font-mono text-xs text-status-good">{inviteSuccess}</p>}
            <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="block">
                <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Name</span>
                <input
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good sm:w-auto"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">Email</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good sm:w-auto"
                />
              </label>
              <button
                type="submit"
                disabled={inviting}
                className="rounded-md bg-status-good px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {inviting ? 'Sending…' : 'Send invite'}
              </button>
            </form>
          </section>
        )}

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
            <table className="w-full border-collapse whitespace-nowrap font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-2 font-normal sm:px-4">Status</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Name</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Clock in</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Clock out</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Notes</th>
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
                    <td className="px-2 py-2 sm:px-4">
                      <StatusDot variant={statusToVariant(record.status)} label={record.status} />
                    </td>
                    <td className="px-2 py-2 text-text sm:px-4">{record.user_name}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{formatTimestamp(record.clock_in)}</td>
                    <td className="px-2 py-2 text-text sm:px-4">{formatTimestamp(record.clock_out)}</td>
                    <td className="px-2 py-2 text-text-muted sm:px-4">{record.notes ?? '—'}</td>
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
