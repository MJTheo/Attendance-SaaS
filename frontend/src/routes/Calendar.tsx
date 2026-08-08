import { useCallback, useEffect, useState } from 'react'
import {
  api,
  type CalendarDay,
  type CalendarStatus,
  type DayDetail,
  type DayStatusCounts,
  type StatusDistribution,
  type TeamDayDetail,
  type UserProfile,
} from '../lib/api'
import { Header } from '../components/Header'
import { Modal } from '../components/Modal'
import { StatusDot, calendarStatusToVariant, type DotVariant } from '../components/StatusDot'
import { isoDate, monthGridCells } from '../lib/period'

function formatTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDayTitle(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function DayDetailBody({ detail }: { detail: DayDetail }) {
  if (!detail.status) {
    return <p className="font-mono text-sm text-text-muted">No record for this day.</p>
  }
  return (
    <div>
      <StatusDot variant={calendarStatusToVariant(detail.status)} label={STATUS_LABEL[detail.status]} />
      {detail.leave_type ? (
        <p className="mt-2 font-mono text-sm text-text">{detail.leave_reason}</p>
      ) : (
        <div className="mt-2 flex flex-col gap-1 font-mono text-sm text-text">
          <span>Clock in: {formatTime(detail.clock_in)}</span>
          <span>Clock out: {detail.clock_out ? formatTime(detail.clock_out) : 'Still clocked in'}</span>
          {detail.notes && <span className="text-text-muted">Notes: {detail.notes}</span>}
        </div>
      )}
    </div>
  )
}

function TeamDayDetailBody({ details }: { details: TeamDayDetail[] }) {
  return (
    <div className="flex flex-col gap-3">
      {details.map((detail) => (
        <div key={detail.user_id} className="rounded-md border border-border p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-sm text-text">{detail.name}</span>
            {detail.status ? (
              <StatusDot variant={calendarStatusToVariant(detail.status)} label={STATUS_LABEL[detail.status]} />
            ) : (
              <span className="font-mono text-xs text-text-muted">No record</span>
            )}
          </div>
          {detail.leave_type ? (
            <p className="font-mono text-xs text-text-muted">{detail.leave_reason}</p>
          ) : detail.clock_in ? (
            <p className="font-mono text-xs text-text-muted">
              {formatTime(detail.clock_in)} – {detail.clock_out ? formatTime(detail.clock_out) : 'still clocked in'}
              {detail.notes ? ` · ${detail.notes}` : ''}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

const STATUS_LABEL: Record<CalendarStatus, string> = {
  present: 'Present',
  late: 'Late',
  early_leave: 'Early leave',
  absent: 'Absent',
  sick_leave: 'Sick leave',
  annual_leave: 'Annual leave',
}

const dotColorClass: Record<DotVariant, string> = {
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
  leave: 'bg-status-leave',
}

const cellBgClass: Record<DotVariant, string> = {
  good: 'bg-status-good-bg',
  warning: 'bg-status-warning-bg',
  neutral: 'bg-status-neutral-bg',
  info: 'bg-status-info-bg',
  leave: 'bg-status-leave-bg',
}

const COUNT_KEYS: { key: keyof StatusDistribution; variant: DotVariant; abbr: string }[] = [
  { key: 'present', variant: 'good', abbr: 'P' },
  { key: 'late', variant: 'warning', abbr: 'L' },
  { key: 'early_leave', variant: 'warning', abbr: 'E' },
  { key: 'absent', variant: 'neutral', abbr: 'A' },
  { key: 'sick_leave', variant: 'info', abbr: 'S' },
  { key: 'annual_leave', variant: 'leave', abbr: 'V' },
]

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function MonthNav({
  year,
  month,
  onChange,
}: {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}) {
  const label = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    onChange(d.getFullYear(), d.getMonth() + 1)
  }
  return (
    <div className="flex items-center gap-1 font-mono text-xs text-text-muted">
      <button onClick={() => shift(-1)} className="rounded-md border border-border px-2 py-1.5 hover:text-text" aria-label="Previous month">
        ←
      </button>
      <span className="min-w-[9rem] px-1 text-center text-text">{label}</span>
      <button onClick={() => shift(1)} className="rounded-md border border-border px-2 py-1.5 hover:text-text" aria-label="Next month">
        →
      </button>
    </div>
  )
}

function PersonalMonthGrid({
  year,
  month,
  days,
  onDayClick,
}: {
  year: number
  month: number
  days: CalendarDay[]
  onDayClick: (iso: string) => void
}) {
  const byDate = new Map(days.map((d) => [d.date, d.status]))
  const cells = monthGridCells(year, month)
  const todayIso = isoDate(new Date())

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAY_HEADERS.map((w) => (
        <div key={w} className="px-1 pb-1 text-center font-mono text-xs uppercase tracking-wide text-text-muted">
          {w}
        </div>
      ))}
      {cells.map((date, i) => {
        if (!date) return <div key={i} />
        const iso = isoDate(date)
        const status = byDate.get(iso) ?? null
        const variant = status ? calendarStatusToVariant(status) : null
        return (
          <button
            key={iso}
            onClick={() => onDayClick(iso)}
            className={`flex min-h-[4.5rem] flex-col gap-1 rounded-md border p-1.5 text-left transition-colors hover:border-status-good sm:p-2 ${
              iso === todayIso ? 'border-status-good' : 'border-border'
            } ${variant ? cellBgClass[variant] : ''}`}
          >
            <span className="font-mono text-xs text-text-muted">{date.getDate()}</span>
            {status && (
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${dotColorClass[variant!]}`} aria-hidden="true" />
                <span className="truncate font-mono text-[0.65rem] text-text sm:text-xs">{STATUS_LABEL[status]}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function TeamMonthGrid({
  year,
  month,
  days,
  onDayClick,
}: {
  year: number
  month: number
  days: DayStatusCounts[]
  onDayClick: (iso: string) => void
}) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const cells = monthGridCells(year, month)
  const todayIso = isoDate(new Date())

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {WEEKDAY_HEADERS.map((w) => (
        <div key={w} className="px-1 pb-1 text-center font-mono text-xs uppercase tracking-wide text-text-muted">
          {w}
        </div>
      ))}
      {cells.map((date, i) => {
        if (!date) return <div key={i} />
        const iso = isoDate(date)
        const counts = byDate.get(iso)
        return (
          <button
            key={iso}
            onClick={() => onDayClick(iso)}
            className={`flex min-h-[4.5rem] flex-col gap-1 rounded-md border p-1.5 text-left transition-colors hover:border-status-good sm:p-2 ${
              iso === todayIso ? 'border-status-good' : 'border-border'
            }`}
          >
            <span className="font-mono text-xs text-text-muted">{date.getDate()}</span>
            <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
              {counts &&
                COUNT_KEYS.filter(({ key }) => counts[key] > 0).map(({ key, variant, abbr }) => (
                  <span key={key} className="flex items-center gap-0.5 font-mono text-[0.65rem] text-text-muted">
                    <span className={`h-1.5 w-1.5 rounded-full ${dotColorClass[variant]}`} aria-hidden="true" />
                    {abbr}
                    {counts[key]}
                  </span>
                ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export function Calendar() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [view, setView] = useState<'mine' | 'team'>('mine')
  const [members, setMembers] = useState<UserProfile[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string>('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [personalDays, setPersonalDays] = useState<CalendarDay[]>([])
  const [teamDays, setTeamDays] = useState<DayStatusCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [dayDetail, setDayDetail] = useState<DayDetail | null>(null)
  const [teamDayDetail, setTeamDayDetail] = useState<TeamDayDetail[] | null>(null)
  const [dayLoading, setDayLoading] = useState(false)
  const [dayError, setDayError] = useState<string | null>(null)

  useEffect(() => {
    api.me().then(setProfile).catch(() => setProfile(null))
  }, [])

  useEffect(() => {
    if (profile?.role === 'admin') {
      api.teamMembers().then(setMembers).catch(() => setMembers([]))
    }
  }, [profile])

  const drilldown = view === 'team' && profile?.role === 'admin' && selectedMemberId !== ''

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      if (view === 'team' && profile.role === 'admin' && selectedMemberId) {
        setPersonalDays(await api.teamMemberCalendar(selectedMemberId, year, month))
      } else if (view === 'team' && profile.role === 'admin') {
        setTeamDays(await api.teamCalendar(year, month))
      } else {
        setPersonalDays(await api.myCalendar(year, month))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [profile, view, selectedMemberId, year, month])

  useEffect(() => {
    load()
  }, [load])

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  function handleMonthChange(newYear: number, newMonth: number) {
    setYear(newYear)
    setMonth(newMonth)
  }

  function handleViewChange(newView: 'mine' | 'team') {
    setView(newView)
    if (newView === 'mine') setSelectedMemberId('')
  }

  async function handleDayClick(iso: string) {
    setSelectedDay(iso)
    setDayError(null)
    setDayLoading(true)
    setDayDetail(null)
    setTeamDayDetail(null)
    try {
      if (view === 'team' && profile!.role === 'admin' && !selectedMemberId) {
        setTeamDayDetail(await api.teamDay(iso))
      } else if (view === 'team' && profile!.role === 'admin' && selectedMemberId) {
        const all = await api.teamDay(iso)
        setDayDetail(all.find((d) => d.user_id === selectedMemberId) ?? null)
      } else {
        setDayDetail(await api.myDay(iso))
      }
    } catch (err) {
      setDayError(err instanceof Error ? err.message : 'Failed to load day detail')
    } finally {
      setDayLoading(false)
    }
  }

  function closeDayModal() {
    setSelectedDay(null)
    setDayDetail(null)
    setTeamDayDetail(null)
    setDayError(null)
  }

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-sans text-lg font-semibold text-text">Calendar</h1>
            {profile.role === 'admin' && (
              <div className="flex overflow-hidden rounded-md border border-border font-mono text-xs">
                <button
                  onClick={() => handleViewChange('mine')}
                  className={`px-3 py-1.5 ${view === 'mine' ? 'bg-status-good text-bg' : 'text-text-muted hover:text-text'}`}
                >
                  My calendar
                </button>
                <button
                  onClick={() => handleViewChange('team')}
                  className={`px-3 py-1.5 ${view === 'team' ? 'bg-status-good text-bg' : 'text-text-muted hover:text-text'}`}
                >
                  Team
                </button>
              </div>
            )}
            {view === 'team' && profile.role === 'admin' && (
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="rounded-md border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text outline-none focus:border-status-good"
              >
                <option value="">All (aggregate)</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <MonthNav year={year} month={month} onChange={handleMonthChange} />
        </div>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        {drilldown && (
          <p className="mb-3 font-mono text-xs text-text-muted">
            Showing {members.find((m) => m.id === selectedMemberId)?.name ?? 'staff member'}'s calendar
          </p>
        )}

        {loading ? (
          <p className="font-mono text-sm text-text-muted">Loading…</p>
        ) : view === 'team' && profile.role === 'admin' && !drilldown ? (
          <TeamMonthGrid year={year} month={month} days={teamDays} onDayClick={handleDayClick} />
        ) : (
          <PersonalMonthGrid year={year} month={month} days={personalDays} onDayClick={handleDayClick} />
        )}

        {selectedDay && (
          <Modal title={formatDayTitle(selectedDay)} onClose={closeDayModal}>
            {dayLoading && <p className="font-mono text-sm text-text-muted">Loading…</p>}
            {dayError && <p className="font-mono text-sm text-status-warning">{dayError}</p>}
            {!dayLoading && !dayError && teamDayDetail && <TeamDayDetailBody details={teamDayDetail} />}
            {!dayLoading && !dayError && !teamDayDetail && dayDetail && <DayDetailBody detail={dayDetail} />}
            {!dayLoading && !dayError && !teamDayDetail && !dayDetail && (
              <p className="font-mono text-sm text-text-muted">No record for this day.</p>
            )}
          </Modal>
        )}

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 font-mono text-xs text-text-muted">
          {(['present', 'late', 'early_leave', 'absent', 'sick_leave', 'annual_leave'] as CalendarStatus[]).map(
            (status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dotColorClass[calendarStatusToVariant(status)]}`} aria-hidden="true" />
                {STATUS_LABEL[status]}
              </span>
            )
          )}
        </div>
      </main>
    </div>
  )
}
