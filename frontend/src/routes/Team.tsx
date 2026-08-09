import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  api,
  isAdmin,
  type OrgSettings,
  type Role,
  type TeamAttendanceRecord,
  type UserProfile,
  type Weekday,
} from '../lib/api'
import { DEMO_ADMIN_EMAIL } from '../lib/demo'
import { Header } from '../components/Header'
import { StatusDot, formatStatusLabel, statusToVariant } from '../components/StatusDot'
import { formatTimestamp } from '../lib/datetime'
import { formatPeriodLabel, periodRange, shiftPeriod, type Granularity } from '../lib/period'

const WEEKDAYS: { value: Weekday; short: string; full: string }[] = [
  { value: 0, short: 'Mon', full: 'Monday' },
  { value: 1, short: 'Tue', full: 'Tuesday' },
  { value: 2, short: 'Wed', full: 'Wednesday' },
  { value: 3, short: 'Thu', full: 'Thursday' },
  { value: 4, short: 'Fri', full: 'Friday' },
  { value: 5, short: 'Sat', full: 'Saturday' },
  { value: 6, short: 'Sun', full: 'Sunday' },
]

function describeWorkingDays(days: number[]): string {
  const set = new Set(days)
  return WEEKDAYS.filter((d) => set.has(d.value))
    .map((d) => d.full)
    .join(', ')
}

// IANA zone names, from the browser itself — avoids shipping/maintaining a
// static list. Falls back to a small curated set on older browsers without
// Intl.supportedValuesOf (Safari < 17, e.g.).
const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [
        'UTC',
        'America/New_York',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Berlin',
        'Asia/Manila',
        'Asia/Tokyo',
        'Asia/Kolkata',
        'Australia/Sydney',
      ]

const ROLE_LABEL: Record<Role, string> = {
  staff: 'Staff',
  admin: 'Admin',
  super_admin: 'Super admin',
}

export function Team() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [records, setRecords] = useState<TeamAttendanceRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(true)
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [granularity, setGranularity] = useState<Granularity>('week')
  const [reference, setReference] = useState(() => new Date())
  const [members, setMembers] = useState<UserProfile[]>([])
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      if (!isAdmin(me)) return
      setOrgSettings(await api.orgSettings())
      if (me.role === 'super_admin') setMembers(await api.teamMembers())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

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

  async function handleWorkingDayToggle(day: Weekday) {
    if (!orgSettings) return
    const set = new Set(orgSettings.working_days)
    if (set.has(day)) {
      set.delete(day)
    } else {
      set.add(day)
    }
    const workingDays = [...set].sort((a, b) => a - b) as Weekday[]
    setError(null)
    setSavingSettings(true)
    try {
      const updated = await api.updateOrgSettings({ working_days: workingDays })
      setOrgSettings(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSavingSettings(false)
    }
  }

  async function handleTimezoneChange(timezone: string) {
    setError(null)
    setSavingSettings(true)
    try {
      const updated = await api.updateOrgSettings({ timezone })
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

  if (!isAdmin(profile)) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">Team</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        {orgSettings && (
          <section className="mb-8 rounded-lg border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Organization settings
            </h2>
            <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted">
              Working days
            </span>
            {profile.email !== DEMO_ADMIN_EMAIL ? (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = orgSettings.working_days.includes(day.value)
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => handleWorkingDayToggle(day.value)}
                      disabled={savingSettings}
                      aria-pressed={active}
                      title={day.full}
                      className={`w-14 rounded-md border px-2 py-1.5 font-mono text-xs disabled:opacity-50 ${
                        active
                          ? 'border-status-good bg-status-good text-bg'
                          : 'border-border text-text-muted hover:text-text'
                      }`}
                    >
                      {day.short}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="font-mono text-sm text-text">{describeWorkingDays(orgSettings.working_days)}</p>
            )}
            <p className="mt-2 font-mono text-xs text-text-muted">
              Controls which weekdays show up in analytics and which days count toward streaks.
            </p>

            <span className="mb-1 mt-4 block font-mono text-xs uppercase tracking-wide text-text-muted">
              Timezone
            </span>
            {profile.email !== DEMO_ADMIN_EMAIL ? (
              <select
                value={orgSettings.timezone}
                onChange={(e) => handleTimezoneChange(e.target.value)}
                disabled={savingSettings}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good disabled:opacity-50 sm:w-auto"
              >
                {!TIMEZONES.includes(orgSettings.timezone) && (
                  <option value={orgSettings.timezone}>{orgSettings.timezone}</option>
                )}
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-mono text-sm text-text">{orgSettings.timezone}</p>
            )}
            <p className="mt-2 font-mono text-xs text-text-muted">
              Defines what "today" means for clock-in caps, streaks, and the daily closeout job — not
              each viewer's own device timezone.
            </p>
          </section>
        )}

        {profile.role === 'super_admin' && (
          <section className="mb-8 rounded-lg border border-border bg-surface p-4 sm:p-6">
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Team roles
            </h2>
            {roleError && <p className="mb-3 font-mono text-xs text-status-warning">{roleError}</p>}
            <div className="flex flex-col gap-2">
              {members.map((member) => {
                const isSelf = member.id === profile.id
                const lockedSuperAdmin = isSelf && member.role === 'super_admin'
                return (
                  <div key={member.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm text-text">
                      {member.name}
                      {isSelf && <span className="text-text-muted"> (you)</span>}
                    </span>
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
                  </div>
                )
              })}
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
                      <StatusDot variant={statusToVariant(record.status)} label={formatStatusLabel(record.status)} />
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
