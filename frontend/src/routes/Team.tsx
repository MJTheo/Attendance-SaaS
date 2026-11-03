import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  api,
  isAdmin,
  type LeaveRequest,
  type ProfileEditRequest,
  type Role,
  type TeamAttendanceRecord,
  type UserProfile,
} from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { ApprovalQueue } from '../components/ApprovalQueue'
import { PROFILE_FIELD_LABEL, changedFields, profileItem, profileToast } from '../components/approvalItems'
import { StatusIcon, formatStatusLabel } from '../components/StatusDot'
import { addDays, formatDayLong, formatDayShort, formatTime, formatWeek, localDate, mondayOf, zonedToUtc } from '../lib/datetime'

const ROLE_LABEL: Record<Role, string> = { staff: 'Staff', admin: 'Admin', super_admin: 'Super admin' }

type Tab = 'attendance' | 'requests' | 'roles' | 'invite'
type Granularity = 'day' | 'week' | 'month'

const SEG_ON = 'bg-action font-semibold text-on-action'
const SEG_OFF = 'bg-transparent text-text-muted hover:text-text'

function initials(name: string): string {
  const parts = name.trim().split(/[\s-]+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? ''))).toUpperCase()
}

export function Team() {
  const { me, notifications, refreshMe, refreshNotifications } = useMe()
  const [params, setParams] = useSearchParams()
  const isSuper = me.role === 'super_admin'
  const isDemo = me.org_plan === 'demo'
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && (requested !== 'roles' || isSuper) ? requested : 'attendance'

  const [members, setMembers] = useState<UserProfile[]>([])
  const [edits, setEdits] = useState<ProfileEditRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [memberList, editList] = await Promise.all([api.teamMembers(), api.profileEdits()])
      setMembers(memberList)
      setEdits(editList)
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

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'attendance', label: 'Attendance' },
    { key: 'requests', label: 'Requests', count: notifications?.profile_changes },
    ...(isSuper ? [{ key: 'roles' as const, label: 'Roles' }] : []),
    { key: 'invite', label: 'Invite' },
  ]

  return (
    <Page title="Team" sub={loaded && !error ? `${members.length} members · ${me.org_name}` : me.org_name} demo={isDemo}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Team sections" className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab}
              onClick={() => setParams(t.key === 'attendance' ? {} : { tab: t.key }, { replace: true })}
              className={`flex h-10 flex-none items-center gap-2 rounded-[9px] px-3.5 text-sm max-sm:h-11 ${t.key === tab ? SEG_ON : SEG_OFF}`}
            >
              {t.label}
              {!!t.count && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-signal px-1.5 font-mono text-[11px] font-semibold text-on-signal">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="hidden text-[13px] text-text-muted sm:inline">Leave and correction approvals are in Inbox</span>
      </div>

      {tab === 'attendance' ? (
        <AttendanceTab members={members} />
      ) : !loaded ? (
        <Skeleton />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : tab === 'requests' ? (
        <RequestsTab
          edits={edits}
          onDecide={async (id, approve) => {
            await (approve ? api.approveProfileEdit(id) : api.rejectProfileEdit(id))
            // An approved name shows up in the roles list too (and in the
            // sidebar, if it was the sole admin's own change).
            await load()
            refreshNotifications()
            refreshMe()
          }}
        />
      ) : tab === 'roles' ? (
        <RolesTab members={members} meId={me.id} onChange={(updated) => setMembers((list) => list.map((m) => (m.id === updated.id ? updated : m)))} />
      ) : (
        <InviteTab readOnly={isDemo} />
      )}
    </Page>
  )
}

function periodDays(anchor: string, granularity: Granularity): string[] {
  if (granularity === 'day') return [anchor]
  if (granularity === 'week') {
    const monday = mondayOf(anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }
  const first = `${anchor.slice(0, 8)}01`
  const days: string[] = []
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = addDays(d, 1)) days.push(d)
  return days
}

function shiftAnchor(anchor: string, granularity: Granularity, delta: number): string {
  if (granularity === 'day') return addDays(anchor, delta)
  if (granularity === 'week') return addDays(anchor, delta * 7)
  const [y, m] = anchor.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 10)
}

function periodLabel(anchor: string, granularity: Granularity): string {
  const year = anchor.slice(0, 4)
  if (granularity === 'day') return `${formatDayLong(anchor)}, ${year}`
  if (granularity === 'week') {
    const monday = mondayOf(anchor)
    return `Week of ${formatWeek(monday)}, ${addDays(monday, 6).slice(0, 4)}`
  }
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${anchor}T12:00:00Z`))
}

const PERIOD_NOUN: Record<Granularity, string> = { day: 'day', week: 'week', month: 'month' }

// Who was in, per working day of the period, in the org's timezone: one
// row per member, one cell per day with the status (icon + label) and the
// clock-in time. Approved leave fills days that have no record.
function AttendanceTab({ members }: { members: UserProfile[] }) {
  const { me } = useMe()
  const tz = me.org_timezone
  const [granularity, setGranularity] = useState<Granularity>('week')
  const [anchor, setAnchor] = useState(() => localDate(new Date(), tz))
  const [records, setRecords] = useState<TeamAttendanceRecord[]>([])
  const [leave, setLeave] = useState<LeaveRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allDays = periodDays(anchor, granularity)
  const first = allDays[0]
  const last = allDays[allDays.length - 1]

  const load = useCallback(async () => {
    setError(null)
    setLoaded(false)
    try {
      const [attendance, leaveRequests] = await Promise.all([
        api.teamAttendance({ start: zonedToUtc(first, '00:00', tz), end: zonedToUtc(addDays(last, 1), '00:00', tz) }),
        api.leaveRequests(),
      ])
      setRecords(attendance)
      setLeave(leaveRequests.filter((l) => l.status === 'approved' && l.start_date <= last && l.end_date >= first))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance')
    } finally {
      setLoaded(true)
    }
  }, [first, last, tz])

  useEffect(() => {
    load()
  }, [load])

  const working = new Set<number>(me.org_working_days)
  const workingDays = allDays.filter((d) => working.has((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7))
  const days = workingDays.length > 0 ? workingDays : allDays

  const byCell = new Map<string, TeamAttendanceRecord>()
  for (const r of records) byCell.set(`${r.user_id}|${localDate(r.clock_in, tz)}`, r)
  const leaveOn = (userId: string, day: string) => leave.find((l) => l.user_id === userId && l.start_date <= day && l.end_date >= day)

  // Everyone on the roster, plus anyone with records who's since left it.
  const rows = [...members]
  for (const r of records) if (!rows.some((m) => m.id === r.user_id)) rows.push({ id: r.user_id, name: r.user_name } as UserProfile)
  rows.sort((a, b) => a.name.localeCompare(b.name))

  const columns = `minmax(180px,1.4fr) repeat(${days.length}, minmax(${granularity === 'month' ? 96 : 0}px,1fr))`
  const minWidth = granularity === 'day' ? undefined : 200 + days.length * (granularity === 'month' ? 106 : 132)

  return (
    <section aria-label="Team attendance" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous period" onClick={() => setAnchor((a) => shiftAnchor(a, granularity, -1))} className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-surface">
            <Chevron d="M15 6l-6 6 6 6" />
          </button>
          <span className="text-[15px] font-semibold">{periodLabel(anchor, granularity)}</span>
          <button type="button" aria-label="Next period" onClick={() => setAnchor((a) => shiftAnchor(a, granularity, 1))} className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-surface">
            <Chevron d="M9 6l6 6-6 6" />
          </button>
        </div>
        <div role="group" aria-label="Period" className="flex gap-1 rounded-xl bg-surface p-1">
          {(['day', 'week', 'month'] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={granularity === g}
              onClick={() => setGranularity(g)}
              className={`h-9 rounded-lg px-3.5 text-[13px] max-sm:h-11 ${granularity === g ? SEG_ON : SEG_OFF}`}
            >
              {{ day: 'Daily', week: 'Weekly', month: 'Monthly' }[g]}
            </button>
          ))}
        </div>
      </div>

      {!loaded ? (
        <Skeleton />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : records.length === 0 && leave.length === 0 ? (
        <div className="flex flex-col items-start gap-2.5 rounded-[16px] bg-surface p-[22px]">
          <span className="text-base font-semibold">Nothing recorded for this {PERIOD_NOUN[granularity]} yet</span>
          <span className="text-sm text-text-muted">
            Rows fill in as people clock in. Go back a {PERIOD_NOUN[granularity]} to see the last full one.
          </span>
          <button
            type="button"
            onClick={() => setAnchor((a) => shiftAnchor(a, granularity, -1))}
            className="h-11 rounded-[10px] bg-action px-[18px] font-semibold text-on-action"
          >
            Previous {PERIOD_NOUN[granularity]}
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[16px] bg-surface">
          <div style={{ minWidth }}>
            <div className="grid h-[42px] items-center gap-2.5 px-[18px] text-xs font-semibold text-text-muted" style={{ gridTemplateColumns: columns }}>
              <div className="sticky left-0 bg-surface">Member</div>
              {days.map((d) => (
                <div key={d} className="font-mono font-medium">
                  {formatDayShort(d)}
                </div>
              ))}
            </div>
            {rows.map((member) => (
              <div
                key={member.id}
                className="grid min-h-[50px] items-center gap-2.5 border-t border-border px-[18px] py-[3px]"
                style={{ gridTemplateColumns: columns }}
              >
                <div className="sticky left-0 truncate bg-surface text-sm">{member.name}</div>
                {days.map((day) => {
                  const record = byCell.get(`${member.id}|${day}`)
                  const onLeave = !record ? leaveOn(member.id, day) : undefined
                  const status = record?.status ?? (onLeave ? (onLeave.leave_type === 'sick' ? 'sick_leave' : 'annual_leave') : null)
                  if (!status) {
                    return (
                      <span key={day} className="font-mono text-xs text-text-muted">
                        —
                      </span>
                    )
                  }
                  // An auto-absent row's clock_in is a placeholder, not a time.
                  const time = record && record.status !== 'absent' ? `in ${formatTime(record.clock_in, tz)}` : '—'
                  return (
                    <div key={day} className="flex min-w-0 flex-col gap-px" title={record?.notes ?? undefined}>
                      <span className="flex items-center gap-[5px] whitespace-nowrap text-xs">
                        <StatusIcon status={status} size={13} />
                        <span className={status === 'present' ? 'text-text-muted' : 'font-medium'}>{formatStatusLabel(status)}</span>
                      </span>
                      <span className="pl-[18px] font-mono text-[11px] text-text-muted">{time}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function Chevron({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

function RequestsTab({ edits, onDecide }: { edits: ProfileEditRequest[]; onDecide: (id: string, approve: boolean) => Promise<void> }) {
  const { me } = useMe()
  const tz = me.org_timezone
  const pending = edits.filter((r) => r.status === 'pending').map((r) => profileItem(r, tz))
  const resolved = edits
    .filter((r) => r.status !== 'pending')
    .map((r) => ({
      id: r.id,
      who: r.user_name ?? 'Someone',
      summary: changedFields(r)
        .map((f) => `${PROFILE_FIELD_LABEL[f]}: ${r.old_value[f] ?? '—'} → ${r.new_value[f]}`)
        .join(', '),
      status: r.awaiting_email_confirmation ? 'awaiting' : r.status,
    }))

  return (
    <section aria-label="Profile change requests" className="max-w-[900px]">
      <ApprovalQueue
        heading="Profile changes waiting"
        pending={pending}
        resolved={resolved}
        emptyTitle="No profile changes waiting"
        emptyBody="When someone asks to change their name or email, it shows up here and in your Inbox."
        onDecide={onDecide}
        toastFor={profileToast}
      />
    </section>
  )
}

function RolesTab({ members, meId, onChange }: { members: UserProfile[]; meId: string; onChange: (updated: UserProfile) => void }) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function changeRole(userId: string, role: Role) {
    setError(null)
    setBusyId(userId)
    try {
      onChange(await api.updateUserRole(userId, role))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setBusyId(null)
    }
  }

  const sorted = [...members].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)))

  return (
    <section aria-label="Team roles" className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="m-0 rounded-xl bg-signal-soft px-3.5 py-3 text-sm">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-[16px] bg-surface">
        <div className="min-w-[620px] sm:min-w-[760px]">
          {sorted.map((m) => (
            <div
              key={m.id}
              className="grid min-h-14 grid-cols-[40px_minmax(0,1fr)_120px_170px] items-center gap-x-3.5 gap-y-2 border-b border-border px-4 py-2 last:border-b-0 sm:grid-cols-[40px_minmax(0,1fr)_130px_200px] sm:px-5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-xs font-semibold">{initials(m.name)}</span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{m.name}</span>
                <span className="truncate font-mono text-[11px] text-text-muted">{m.email}</span>
              </span>
              <span>
                <span className="inline-flex h-6 items-center whitespace-nowrap rounded-xl border border-border-strong px-2.5 text-xs">{ROLE_LABEL[m.role]}</span>
              </span>
              {m.id === meId ? (
                <span className="flex items-center gap-2 text-xs text-text-muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Your own role is locked
                </span>
              ) : (
                <select
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  disabled={busyId === m.id}
                  onChange={(e) => changeRole(m.id, e.target.value as Role)}
                  className="h-11 rounded-[10px] bg-surface-raised px-2.5 text-[13px] text-text disabled:opacity-60"
                >
                  {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function InviteTab({ readOnly }: { readOnly: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSentTo(null)
    setSending(true)
    try {
      await api.inviteStaff(email, name)
      setSentTo(email)
      setName('')
      setEmail('')
    } catch (err) {
      // The backend's detail is already specific (already registered, rate
      // limited, …) — show it as-is.
      setError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setSending(false)
    }
  }

  const input = `h-[46px] rounded-[10px] border px-3.5 outline-none focus:border-text ${
    readOnly ? 'border-dashed border-border-strong bg-transparent text-text-muted' : 'border-border bg-bg text-text'
  }`

  return (
    <section aria-labelledby="invite-heading" className="flex max-w-[620px] flex-col gap-4 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
      <h2 id="invite-heading" className="m-0 text-lg font-semibold">
        Invite a member
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-muted">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required disabled={readOnly} className={input} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] text-text-muted">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={readOnly} className={`${input} font-mono text-[13px]`} />
          </label>
        </div>
        <button
          type="submit"
          disabled={readOnly || sending}
          className={`h-12 self-stretch rounded-[10px] px-[22px] font-semibold sm:self-start ${
            readOnly ? 'cursor-not-allowed bg-surface-raised text-text-muted' : 'bg-action text-on-action disabled:opacity-60'
          }`}
        >
          {sending ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {sentTo && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-status-good-bg px-3.5 py-3 text-sm">
          <span className="mt-[3px]">
            <StatusIcon status="approved" size={15} />
          </span>
          <span>
            Invite sent to <span className="[overflow-wrap:anywhere]">{sentTo}</span>. They'll get a link to set their password.
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-status-warning-bg px-3.5 py-3 text-sm">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-[3px] shrink-0 text-status-warning">
            <path d="M8 2.5l6 11H2zM8 7v3M8 12h.01" />
          </svg>
          <span>{error}</span>
        </div>
      )}
    </section>
  )
}
