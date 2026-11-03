import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  isAdmin,
  type CalendarDay,
  type CalendarStatus,
  type DayStatusCounts,
  type StatusDistribution,
  type TeamDayDetail,
  type UserProfile,
} from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { StatusDot, StatusIcon, formatStatusLabel, calendarStatusToVariant, type DotVariant } from '../components/StatusDot'
import { formatTime, localDate } from '../lib/datetime'
import { isoDate, monthGridCells } from '../lib/period'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const WEEKDAY_LONG = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' })

// Legend and team-count order: the groups an admin scans for first.
const LEGEND: CalendarStatus[] = ['present', 'late', 'early_leave', 'missed_clockout', 'absent', 'sick_leave', 'annual_leave']
const COUNT_ORDER: (keyof StatusDistribution)[] = ['present', 'late', 'early_leave', 'absent', 'sick_leave', 'annual_leave']
const COUNT_WORD: Record<keyof StatusDistribution, string> = {
  present: 'present',
  late: 'late',
  early_leave: 'early',
  absent: 'absent',
  sick_leave: 'sick',
  annual_leave: 'annual',
}
const BAR_COLOR: Record<DotVariant, string> = {
  good: 'bg-status-good',
  warning: 'bg-status-warning',
  neutral: 'bg-status-neutral',
  sick: 'bg-status-sick',
  annual: 'bg-status-annual',
}
const TINT: Record<DotVariant, string> = {
  good: 'bg-status-good-bg',
  warning: 'bg-status-warning-bg',
  neutral: 'bg-status-neutral-bg',
  sick: 'bg-status-sick-bg',
  annual: 'bg-status-annual-bg',
}
// Phone cells show only an icon, so the cell tint carries anything that
// isn't "present" (literal classes so Tailwind generates them).
const MOBILE_TINT: Record<DotVariant, string> = {
  good: '',
  warning: 'max-sm:bg-status-warning-bg',
  neutral: 'max-sm:bg-status-neutral-bg',
  sick: 'max-sm:bg-status-sick-bg',
  annual: 'max-sm:bg-status-annual-bg',
}
const WORKING_DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function describeWorkingDays(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b)
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  if (contiguous && sorted.length > 2) return `${WORKING_DAY_NAMES[sorted[0]]}–${WORKING_DAY_NAMES[sorted[sorted.length - 1]]}`
  return sorted.map((d) => WORKING_DAY_NAMES[d]).join(', ')
}

function dayTitle(iso: string): string {
  return `${WEEKDAY_LONG.format(new Date(`${iso}T12:00:00Z`))} ${Number(iso.slice(8))}`
}

export function Calendar() {
  const { me } = useMe()
  const tz = me.org_timezone
  const admin = isAdmin(me)
  const todayIso = localDate(new Date(), tz)
  const [view, setView] = useState<'mine' | 'team'>('mine')
  const [members, setMembers] = useState<UserProfile[]>([])
  const [personId, setPersonId] = useState('')
  const [year, setYear] = useState(Number(todayIso.slice(0, 4)))
  const [month, setMonth] = useState(Number(todayIso.slice(5, 7)))
  const [personalDays, setPersonalDays] = useState<CalendarDay[]>([])
  const [teamDays, setTeamDays] = useState<DayStatusCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(todayIso)
  const [teamDetail, setTeamDetail] = useState<TeamDayDetail[] | null>(null)
  const [dayLoading, setDayLoading] = useState(false)

  useEffect(() => {
    if (admin) api.teamMembers().then(setMembers).catch(() => setMembers([]))
  }, [admin])

  const teamAggregate = view === 'team' && admin && personId === ''

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (view === 'team' && admin && personId) {
        setPersonalDays(await api.teamMemberCalendar(personId, year, month))
      } else if (view === 'team' && admin) {
        setTeamDays(await api.teamCalendar(year, month))
      } else {
        setPersonalDays(await api.myCalendar(year, month))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [admin, view, personId, year, month])

  useEffect(() => {
    load()
  }, [load])

  // The team view's day panel lists people, which comes from the day endpoint.
  useEffect(() => {
    if (!teamAggregate || !selected) {
      setTeamDetail(null)
      return
    }
    setDayLoading(true)
    api
      .teamDay(selected)
      .then(setTeamDetail)
      .catch(() => setTeamDetail(null))
      .finally(() => setDayLoading(false))
  }, [teamAggregate, selected])

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(year, month - 1 + delta, 1))
    setYear(d.getUTCFullYear())
    setMonth(d.getUTCMonth() + 1)
    setSelected(null)
  }

  const personalByDate = useMemo(() => new Map(personalDays.map((d) => [d.date, d])), [personalDays])
  const teamByDate = useMemo(() => new Map(teamDays.map((d) => [d.date, d])), [teamDays])
  const working = new Set<number>(me.org_working_days)
  const personName = members.find((m) => m.id === personId)?.name
  const title = MONTH_LONG.format(new Date(Date.UTC(year, month - 1, 1)))
  const sub = `Calendar · ${tz} · working days ${describeWorkingDays(me.org_working_days)}`

  const controls = (
    <div className="flex flex-wrap items-center gap-2.5">
      {admin && (
        <div role="group" aria-label="Calendar view" className="flex gap-1 rounded-xl bg-surface p-1">
          {(['mine', 'team'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => {
                setView(v)
                if (v === 'mine') setPersonId('')
              }}
              className={`h-9 rounded-[9px] px-4 text-[13px] ${view === v ? 'bg-action font-semibold text-on-action' : 'text-text-muted'}`}
            >
              {v === 'mine' ? 'Mine' : 'Team'}
            </button>
          ))}
        </div>
      )}
      {admin && view === 'team' && (
        <select
          aria-label="Person"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="h-11 min-w-0 flex-[1_1_100%] rounded-xl bg-surface px-3 text-[13px] text-text sm:flex-none"
        >
          <option value="">Everyone ({members.length})</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}
      <div className="ml-auto flex gap-1">
        {[
          { label: 'Previous month', d: 'M15 6l-6 6 6 6', delta: -1 },
          { label: 'Next month', d: 'M9 6l6 6-6 6', delta: 1 },
        ].map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            onClick={() => shiftMonth(b.delta)}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={b.d} />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )

  const cells = monthGridCells(year, month)

  return (
    <Page title={title} sub={sub}>
      <div className="flex flex-col gap-4">
        {controls}
        {error ? (
          <LoadError message={error} onRetry={load} />
        ) : loading ? (
          <Skeleton />
        ) : (
          <div className="flex flex-wrap items-start gap-5">
            <section aria-label={title} className="flex min-w-0 flex-[1_1_560px] flex-col gap-3.5">
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className="px-1 pb-0.5 text-center text-xs font-semibold text-text-muted sm:text-left">
                    <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
                    <span className="hidden sm:inline">{w}</span>
                  </div>
                ))}
                {cells.map((date, i) => {
                  if (!date) return <div key={i} />
                  const iso = isoDate(date)
                  const weekday = (date.getDay() + 6) % 7
                  const isWorking = working.has(weekday)
                  const isFuture = iso > todayIso
                  const isSelected = iso === selected
                  const isToday = iso === todayIso
                  const personal = personalByDate.get(iso)
                  const counts = teamByDate.get(iso)
                  const status = !teamAggregate ? personal?.status ?? null : null
                  const variant = status ? calendarStatusToVariant(status) : null
                  const isLeave = status === 'sick_leave' || status === 'annual_leave'
                  const teamTotal = counts ? COUNT_ORDER.reduce((n, k) => n + counts[k], 0) : 0

                  let look = 'bg-surface'
                  if (isSelected || isToday) look = 'border-2 border-text bg-surface'
                  else if (!isWorking) look = 'text-text-muted'
                  else if (isFuture) look = 'border border-dashed border-border text-text-muted'
                  else if (isLeave && variant) look = TINT[variant]
                  const mobileTint = variant && !isLeave && !isSelected && !isToday ? MOBILE_TINT[variant] : ''

                  const aria = `${dayTitle(iso)}${
                    teamAggregate ? (teamTotal ? `, ${counts?.present ?? 0} present` : '') : status ? `, ${formatStatusLabel(status)}` : ''
                  }`
                  return (
                    <button
                      key={iso}
                      type="button"
                      onClick={() => setSelected(iso)}
                      aria-label={aria}
                      aria-pressed={isSelected}
                      className={`flex h-[58px] flex-col gap-[5px] overflow-hidden rounded-[10px] px-[5px] py-1.5 text-left sm:h-[104px] sm:rounded-xl sm:px-[9px] sm:py-2 ${look} ${mobileTint}`}
                      style={
                        !isWorking && !isSelected && !isToday
                          ? { background: 'repeating-linear-gradient(135deg, var(--color-off-day) 0 6px, transparent 6px 12px)' }
                          : undefined
                      }
                    >
                      <span className="flex w-full items-center justify-between">
                        <span className={`font-mono text-xs ${isSelected || isToday ? 'font-semibold' : ''} ${isFuture && isWorking ? 'opacity-70' : ''}`}>
                          {date.getDate()}
                        </span>
                        <span className="hidden text-[11px] text-text-muted sm:inline">{isToday ? 'Today' : !isWorking ? 'Off' : ''}</span>
                      </span>
                      {teamAggregate && counts && teamTotal > 0 && <TeamCellBody counts={counts} />}
                      {!teamAggregate && status && personal && <PersonalCellBody day={personal} status={status} tz={tz} />}
                    </button>
                  )
                })}
              </div>
              <div aria-label="Legend" className="flex flex-wrap gap-1.5">
                {LEGEND.map((s) => (
                  <StatusDot key={s} status={s} />
                ))}
              </div>
            </section>
            <DayPanel
              selected={selected}
              teamAggregate={teamAggregate}
              teamDetail={teamDetail}
              dayLoading={dayLoading}
              personal={selected ? personalByDate.get(selected) : undefined}
              who={view === 'mine' || !admin ? 'Your record' : personName ?? ''}
              tz={tz}
            />
          </div>
        )}
      </div>
    </Page>
  )
}

function PersonalCellBody({ day, status, tz }: { day: CalendarDay; status: CalendarStatus; tz: string }) {
  const variant = calendarStatusToVariant(status)
  const isLeave = status === 'sick_leave' || status === 'annual_leave'
  return (
    <>
      <span className="sm:hidden">
        <StatusIcon status={status} />
      </span>
      <span className="hidden w-full truncate text-xs sm:block">
        {day.clock_in && <span className="font-mono font-semibold">{formatTime(day.clock_in, tz)} </span>}
        <span className="text-text-muted">{formatStatusLabel(status)}</span>
      </span>
      <span aria-hidden="true" className={`hidden h-1.5 w-full rounded-[2px] sm:block ${BAR_COLOR[variant]}`} />
      <span className="hidden truncate text-[11px] leading-[1.3] text-text-muted sm:block">
        {isLeave
          ? day.leave_reason
          : day.clock_in && day.clock_out && status !== 'missed_clockout'
            ? `out ${formatTime(day.clock_out, tz)}`
            : ''}
      </span>
    </>
  )
}

function TeamCellBody({ counts }: { counts: DayStatusCounts }) {
  const rest = COUNT_ORDER.slice(1)
    .filter((k) => counts[k] > 0)
    .map((k) => `${counts[k]} ${COUNT_WORD[k]}`)
    .join(' · ')
  return (
    <>
      <span className="whitespace-nowrap text-xs">
        <span className="font-mono font-semibold">{counts.present}</span>{' '}
        <span className="hidden text-text-muted sm:inline">present</span>
      </span>
      <span aria-hidden="true" className="flex h-1.5 w-full gap-0.5">
        {COUNT_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <span key={k} className={`h-1.5 rounded-[2px] ${BAR_COLOR[calendarStatusToVariant(k as CalendarStatus)]}`} style={{ flex: counts[k] }} />
        ))}
      </span>
      <span className="hidden text-[11px] leading-[1.3] text-text-muted sm:block">{rest}</span>
    </>
  )
}

function DayPanel({
  selected,
  teamAggregate,
  teamDetail,
  dayLoading,
  personal,
  who,
  tz,
}: {
  selected: string | null
  teamAggregate: boolean
  teamDetail: TeamDayDetail[] | null
  dayLoading: boolean
  personal: CalendarDay | undefined
  who: string
  tz: string
}) {
  // A missed clock-out's clock_out is a day-boundary placeholder: show "—".
  const times = (clockIn: string | null, clockOut: string | null, status: CalendarStatus | null) =>
    clockIn ? `${formatTime(clockIn, tz)} → ${clockOut && status !== 'missed_clockout' ? formatTime(clockOut, tz) : '—'}` : ''

  let groups: { status: CalendarStatus; people: { name: string; times: string }[] }[] = []
  let sub = who
  if (teamAggregate && teamDetail) {
    const byStatus = new Map<CalendarStatus, { name: string; times: string }[]>()
    for (const d of teamDetail) {
      if (!d.status) continue
      const list = byStatus.get(d.status) ?? []
      list.push({ name: d.name, times: times(d.clock_in, d.clock_out, d.status) })
      byStatus.set(d.status, list)
    }
    // Exceptions first, then who was simply present.
    const order: CalendarStatus[] = ['late', 'early_leave', 'missed_clockout', 'absent', 'sick_leave', 'annual_leave', 'present']
    groups = order.filter((s) => byStatus.has(s)).map((s) => ({ status: s, people: byStatus.get(s)! }))
    sub = `${byStatus.get('present')?.length ?? 0} of ${teamDetail.length} present`
  } else if (!teamAggregate && personal?.status) {
    // One person: the chip is the day's status, the row says what it is.
    const isLeave = personal.status === 'sick_leave' || personal.status === 'annual_leave'
    groups = [{
      status: personal.status,
      people: [isLeave ? { name: 'Reason', times: personal.leave_reason ?? '' } : { name: 'Time', times: times(personal.clock_in, personal.clock_out, personal.status) }],
    }]
  }

  return (
    <section aria-labelledby="day-heading" className="flex min-w-0 flex-[1_1_100%] flex-col gap-3.5 rounded-[16px] bg-surface p-[18px] sm:flex-[0_1_300px]">
      {selected ? (
        <>
          <div className="flex flex-col gap-0.5">
            <h2 id="day-heading" className="m-0 text-lg font-semibold">
              {dayTitle(selected)}
            </h2>
            <div className="text-[13px] text-text-muted">{sub}</div>
          </div>
          {dayLoading && <span className="text-sm text-text-muted">Loading…</span>}
          {!dayLoading && groups.length === 0 && <span className="text-sm text-text-muted">Nothing recorded for this day.</span>}
          {groups.map((g) => (
            <div key={g.status} className="flex flex-col gap-1">
              <span className="self-start">
                <StatusDot status={g.status} label={teamAggregate ? `${formatStatusLabel(g.status)} · ${g.people.length}` : undefined} />
              </span>
              {g.people.map((p, i) => (
                <div key={i} className="flex min-h-[30px] items-baseline justify-between gap-2.5 border-b border-border px-0.5 py-1">
                  <span className="min-w-0 truncate text-[13px]">{p.name}</span>
                  <span className="whitespace-nowrap font-mono text-xs text-text-muted">{p.times}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (
        <>
          <h2 id="day-heading" className="m-0 text-base font-semibold">
            Pick a day
          </h2>
          <span className="text-sm text-text-muted">Select any day to see what was recorded.</span>
        </>
      )}
    </section>
  )
}
