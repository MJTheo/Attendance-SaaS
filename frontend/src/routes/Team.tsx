import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  api,
  isAdmin,
  type ProfileEditRequest,
  type Role,
  type TeamAttendanceRecord,
  type UserProfile,
} from '../lib/api'
import { DEMO_ADMIN_EMAIL } from '../lib/demo'
import { Skeleton } from '../components/Skeleton'
import { useMe } from '../lib/me-context'
import { ProfileEditsList } from '../components/ProfileEditsList'
import { StatusDot } from '../components/StatusDot'
import { formatTimestamp } from '../lib/datetime'
import { formatPeriodLabel, periodRange, shiftPeriod, type Granularity } from '../lib/period'

const ROLE_LABEL: Record<Role, string> = {
  staff: 'Staff',
  admin: 'Admin',
  super_admin: 'Super admin',
}

// Bordered pill, not a StatusDot color — roles aren't attendance status, and
// reusing that dot language here would blur what the colored dots mean
// elsewhere in the app. super_admin borrows the existing "good" accent
// (already used for active-nav/you-are-here) to read as the elevated role,
// rather than introducing a new hue.
const ROLE_BADGE_CLASS: Record<Role, string> = {
  staff: 'rounded-full border border-border px-2 py-0.5 text-xs text-text-muted',
  admin: 'rounded-full border border-border px-2 py-0.5 text-xs text-text',
  super_admin: 'rounded-full border border-status-good/40 bg-status-good/10 px-2 py-0.5 text-xs text-status-good',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function Team() {
  const { me: profile, refreshMe, refreshNotifications } = useMe()
  const [loaded, setLoaded] = useState(false)
  const [records, setRecords] = useState<TeamAttendanceRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [granularity, setGranularity] = useState<Granularity>('week')
  const [reference, setReference] = useState(() => new Date())
  const [members, setMembers] = useState<UserProfile[]>([])
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [profileEdits, setProfileEdits] = useState<ProfileEditRequest[]>([])
  const [profileEditError, setProfileEditError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (!isAdmin(profile)) return
      setProfileEdits(await api.profileEdits())
      if (profile.role === 'super_admin') setMembers(await api.teamMembers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [profile])

  async function handleRoleChange(userId: string, role: Role) {
    setRoleError(null)
    setRoleUpdatingId(userId)
    try {
      const updated = await api.updateUserRole(userId, role)
      setMembers((current) => current.map((m) => (m.id === updated.id ? updated : m)))
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setRoleUpdatingId(null)
    }
  }

  async function handleProfileEdit(id: string, approve: boolean) {
    setProfileEditError(null)
    try {
      if (approve) {
        await api.approveProfileEdit(id)
      } else {
        await api.rejectProfileEdit(id)
      }
      // Re-read everything: an approved name shows up in the roles table too
      // (and in the sidebar, if it was the sole admin's own change).
      await load()
      refreshNotifications()
      refreshMe()
    } catch (err) {
      // e.g. "Another admin has to review your own profile change"
      setProfileEditError(err instanceof Error ? err.message : 'Failed to update request')
    }
  }

  useEffect(() => {
    load()
  }, [load])

  const loadAttendance = useCallback(async () => {
    setRecordsLoading(true)
    try {
      const { start, end } = periodRange(reference, granularity)
      const attendance = await api.teamAttendance({ start: start.toISOString(), end: end.toISOString() })
      setRecords(attendance)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance')
    } finally {
      setRecordsLoading(false)
    }
  }, [reference, granularity])

  useEffect(() => {
    if (profile && isAdmin(profile)) loadAttendance()
  }, [profile, loadAttendance])

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

  if (!isAdmin(profile)) {
    return <Navigate to="/" replace />
  }

  if (!loaded) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton />
      </main>
    )
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">Team</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Profile change requests
          </h2>
          {profileEditError && <p className="mb-3 font-mono text-xs text-status-warning">{profileEditError}</p>}
          {loading ? (
            <p className="font-mono text-sm text-text-muted">Loading…</p>
          ) : (
            <ProfileEditsList
              requests={profileEdits.filter((r) => r.status === 'pending')}
              showActions
              showRequester
              onApprove={(id) => handleProfileEdit(id, true)}
              onReject={(id) => handleProfileEdit(id, false)}
            />
          )}
          {profileEdits.some((r) => r.status !== 'pending') && (
            <details className="mt-3">
              <summary className="cursor-pointer font-mono text-xs text-text-muted hover:text-text">
                Resolved requests
              </summary>
              <div className="mt-3">
                <ProfileEditsList requests={profileEdits.filter((r) => r.status !== 'pending')} showRequester />
              </div>
            </details>
          )}
        </section>

        {profile.role === 'super_admin' && (
          <section className="mb-8">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Team roles
            </h2>
            {roleError && <p className="mb-3 font-mono text-xs text-status-warning">{roleError}</p>}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse font-mono text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="px-2 py-2 font-normal sm:px-4">Member</th>
                    <th className="px-2 py-2 font-normal sm:px-4">Role</th>
                    <th className="px-2 py-2 font-normal sm:px-4">Change role</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const isSelf = member.id === profile.id
                    const lockedSuperAdmin = isSelf && member.role === 'super_admin'
                    return (
                      <tr key={member.id} className="border-b border-border last:border-0">
                        <td className="px-2 py-2 sm:px-4">
                          <div className="flex items-center gap-3">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-border/60 font-sans text-xs font-semibold text-text">
                              {initials(member.name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-text">
                                {member.name}
                                {isSelf && <span className="text-text-muted"> (you)</span>}
                              </p>
                              <p className="truncate text-xs text-text-muted">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 sm:px-4">
                          <span className={ROLE_BADGE_CLASS[member.role]}>{ROLE_LABEL[member.role]}</span>
                        </td>
                        <td className="px-2 py-2 sm:px-4">
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value as Role)}
                            disabled={roleUpdatingId === member.id || lockedSuperAdmin}
                            title={lockedSuperAdmin ? "You can't remove your own super admin role" : undefined}
                            className="rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-status-good disabled:opacity-50"
                          >
                            {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                              <option key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
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

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Team attendance
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={granularity}
                onChange={(e) => setGranularity(e.target.value as Granularity)}
                className="rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-status-good"
              >
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
              <div className="flex items-center gap-1 font-mono text-xs text-text-muted">
                <button
                  onClick={() => setReference((r) => shiftPeriod(r, granularity, -1))}
                  className="rounded-md border border-border px-2 py-1.5 hover:text-text"
                  aria-label="Previous period"
                >
                  ←
                </button>
                <span className="min-w-[10rem] px-1 text-center text-text">
                  {formatPeriodLabel(reference, granularity)}
                </span>
                <button
                  onClick={() => setReference((r) => shiftPeriod(r, granularity, 1))}
                  className="rounded-md border border-border px-2 py-1.5 hover:text-text"
                  aria-label="Next period"
                >
                  →
                </button>
              </div>
            </div>
          </div>
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
                {!recordsLoading && records.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                      No records for this period.
                    </td>
                  </tr>
                )}
                {records.map((record) => (
                  <tr key={record.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2 sm:px-4">
                      <StatusDot status={record.status} />
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
    </>
  )
}
