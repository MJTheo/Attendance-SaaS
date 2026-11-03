import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type AttendanceRecord, type CorrectionFields, type DayDetail } from '../lib/api'
import { StatusDot } from '../components/StatusDot'
import { LoadError, Skeleton } from '../components/Skeleton'
import { Page } from '../components/Page'
import { EmptyCard } from '../components/RequestCard'
import { CorrectionForm } from '../components/CorrectionForm'
import { useMe } from '../lib/me-context'
import {
  formatDayLong,
  formatDayShort,
  formatDuration,
  formatTime,
  formatToday,
  formatWeek,
  localDate,
  localMinutes,
  mondayOf,
} from '../lib/datetime'

// The today track runs 06:00–22:00 in the org's timezone.
const TRACK_START = 6 * 60
const TRACK_SPAN = 16 * 60
const TICKS_DESKTOP = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00']
const TICKS_MOBILE = ['06:00', '14:00', '22:00']
// Enough recent rows for two or three weeks of history.
const HISTORY_ROWS = 14

function pct(minutes: number): number {
  return Math.min(100, Math.max(0, ((minutes - TRACK_START) / TRACK_SPAN) * 100))
}

type TodayState = 'notIn' | 'clockedIn' | 'done' | 'onLeave'

export function Dashboard() {
  const { me, refreshNotifications } = useMe()
  const tz = me.org_timezone
  const [history, setHistory] = useState<AttendanceRecord[]>([])
  const [streak, setStreak] = useState(0)
  const [todayDetail, setTodayDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [notes, setNotes] = useState('')
  const [correctingRecordId, setCorrectingRecordId] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  const loadHistory = useCallback(async () => {
    const [historyData, streakData, todayData] = await Promise.all([api.history(), api.streak(), api.myToday()])
    setHistory(historyData)
    setStreak(streakData.current_streak)
    setTodayDetail(todayData)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      await loadHistory()
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [loadHistory])

  useEffect(() => {
    load()
  }, [load])

  // Keep the "now" marker and the running duration current.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const header = {
    title: 'Dashboard',
    sub: `${formatToday(tz)} · ${tz}`,
    right: (
      <div className="flex items-baseline gap-2 rounded-xl bg-surface px-4 py-2.5">
        <span className="text-[13px] text-text-muted">Streak</span>
        <span className="font-mono text-[22px] font-medium">{streak}</span>
        <span className="text-[13px] text-text-muted">{streak === 1 ? 'day' : 'days'}</span>
      </div>
    ),
  }

  if (loading) {
    return (
      <Page {...header} maxWidth={940}>
        <Skeleton />
      </Page>
    )
  }

  if (loadError) {
    return (
      <Page {...header} maxWidth={940}>
        <LoadError onRetry={load} />
      </Page>
    )
  }

  // status !== 'absent' excludes auto-absent records — those also carry
  // clock_out = null by design (no clock-in ever happened), same reason
  // the backend's AttendanceRepository.get_open_record() excludes them.
  const openRecord = history.find((record) => record.clock_out === null && record.status !== 'absent') ?? null
  // todayDetail is the org's own local today, computed server-side.
  const state: TodayState = todayDetail?.leave_type
    ? 'onLeave'
    : openRecord
      ? 'clockedIn'
      : todayDetail?.clock_out != null
        ? 'done'
        : 'notIn'

  async function handleClockIn() {
    setActionError(null)
    setActionPending(true)
    try {
      await api.clockIn()
      await loadHistory()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Clock in failed')
    } finally {
      setActionPending(false)
    }
  }

  async function handleClockOut() {
    setActionError(null)
    setActionPending(true)
    try {
      await api.clockOut(notes || undefined)
      setNotes('')
      await loadHistory()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Clock out failed')
    } finally {
      setActionPending(false)
    }
  }

  async function handleRequestCorrection(recordId: string, reason: string, newValue: CorrectionFields) {
    await api.requestCorrection(recordId, reason, newValue)
    // A correction on a missed clock-out clears it from the inbox count.
    refreshNotifications()
    setCorrectingRecordId(null)
  }

  return (
    <Page {...header} maxWidth={940}>
      <TodayCard
        state={state}
        tz={tz}
        now={now}
        openRecord={openRecord}
        today={todayDetail}
        notes={notes}
        onNotes={setNotes}
        pending={actionPending}
        error={actionError}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
      />
      <History
        records={history.slice(0, HISTORY_ROWS)}
        tz={tz}
        openId={correctingRecordId}
        onToggle={(id) => setCorrectingRecordId((current) => (current === id ? null : id))}
        onSubmit={handleRequestCorrection}
      />
    </Page>
  )
}

function TodayCard({
  state,
  tz,
  now,
  openRecord,
  today,
  notes,
  onNotes,
  pending,
  error,
  onClockIn,
  onClockOut,
}: {
  state: TodayState
  tz: string
  now: Date
  openRecord: AttendanceRecord | null
  today: DayDetail | null
  notes: string
  onNotes: (value: string) => void
  pending: boolean
  error: string | null
  onClockIn: () => void
  onClockOut: () => void
}) {
  const nowMin = localMinutes(now, tz)
  const nowTime = formatTime(now.toISOString(), tz)
  const leaveStatus = today?.leave_type === 'sick' ? 'sick_leave' : 'annual_leave'

  let chip = { status: 'absent', label: 'Not clocked in' }
  let big = nowTime
  let after = ''
  let dur = 'now'
  let segment: { left: number; width: number; closed: boolean } | null = null
  let sub: string | null = null
  if (state === 'clockedIn' && openRecord) {
    const inMin = localMinutes(openRecord.clock_in, tz)
    chip = { status: 'present', label: 'Clocked in' }
    big = formatTime(openRecord.clock_in, tz)
    after = '→ now'
    dur = formatDuration((now.getTime() - new Date(openRecord.clock_in).getTime()) / 60_000)
    segment = { left: pct(inMin), width: pct(nowMin) - pct(inMin), closed: false }
  } else if (state === 'done' && today?.clock_in && today.clock_out) {
    const inMin = localMinutes(today.clock_in, tz)
    const outMin = localMinutes(today.clock_out, tz)
    chip = { status: 'present', label: 'Done for today' }
    big = formatTime(today.clock_in, tz)
    after = `→ ${formatTime(today.clock_out, tz)}`
    dur = formatDuration((new Date(today.clock_out).getTime() - new Date(today.clock_in).getTime()) / 60_000)
    segment = { left: pct(inMin), width: Math.max(0, pct(outMin) - pct(inMin)), closed: true }
    sub = `Clocked out at ${formatTime(today.clock_out, tz)}. See you tomorrow.`
  } else if (state === 'onLeave') {
    chip = { status: leaveStatus, label: leaveStatus === 'sick_leave' ? 'Sick leave' : 'Annual leave' }
    big = 'On leave'
    dur = ''
    sub = `${today?.leave_reason ? `${today.leave_reason} · approved. ` : ''}No clock-in needed today.`
  }
  if (pending) chip = { status: 'absent', label: state === 'clockedIn' ? 'Clocking out…' : 'Clocking in…' }
  if (error) {
    chip = { status: 'missed_clockout', label: 'Not saved' }
    sub = `${error}. Try again.`
  }
  const hasAction = state === 'notIn' || state === 'clockedIn'
  const aria =
    state === 'onLeave'
      ? 'On leave today'
      : segment
        ? `Today from 06:00 to 22:00: ${chip.label.toLowerCase()} at ${big}${after ? ` ${after}` : ''}`
        : `Today from 06:00 to 22:00, now ${nowTime}`

  return (
    <section aria-labelledby="today-heading" className="flex flex-col gap-5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <h2 id="today-heading" className="m-0 text-base font-semibold">
            Today
          </h2>
          <span className="self-start">
            <StatusDot status={chip.status} label={chip.label} />
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-3 font-mono">
          <span className="text-[44px] font-medium leading-none tracking-[-0.03em]">{big}</span>
          {after && <span className="text-lg text-text-muted">{after}</span>}
          {dur && <span className="text-sm text-text-muted">{dur}</span>}
        </div>
      </div>

      <div aria-label={aria} role="img" className="flex flex-col gap-2">
        <div className="relative h-8 overflow-hidden rounded-[10px] bg-surface-raised">
          {state === 'onLeave' ? (
            <div
              className={`absolute inset-0 ${leaveStatus === 'sick_leave' ? 'text-status-sick' : 'text-status-annual'}`}
              style={{ background: 'repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 28%, transparent) 0 6px, transparent 6px 12px)' }}
            />
          ) : (
            <>
              {segment && (
                <div
                  className={`absolute inset-y-0 border-l-2 border-status-good bg-status-good/20 ${segment.closed ? 'border-r-2' : ''}`}
                  style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
                />
              )}
              {nowMin >= TRACK_START && nowMin <= TRACK_START + TRACK_SPAN && (
                <div className="absolute inset-y-1.5 w-0.5 rounded-[1px] bg-text" style={{ left: `${pct(nowMin)}%` }} />
              )}
            </>
          )}
        </div>
        <div className="flex justify-between font-mono text-[11px] text-text-muted">
          {TICKS_DESKTOP.map((tick) => (
            <span key={tick} className={TICKS_MOBILE.includes(tick) ? '' : 'hidden sm:inline'}>
              {tick}
            </span>
          ))}
        </div>
      </div>

      {sub && <p className={`m-0 text-sm ${error ? 'text-error' : 'text-text-muted'}`}>{sub}</p>}

      {hasAction && (
        <div className="flex flex-wrap items-end gap-3">
          {state === 'clockedIn' && (
            <label className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
              <span className="text-[13px] text-text-muted">Note for clock out (optional)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => onNotes(e.target.value)}
                placeholder="Anything your admin should know"
                className="h-12 rounded-[10px] border border-border bg-bg px-3.5 text-text outline-none focus:border-text"
              />
            </label>
          )}
          <button
            type="button"
            onClick={state === 'clockedIn' ? onClockOut : onClockIn}
            disabled={pending}
            className="h-14 flex-[1_1_100%] rounded-xl bg-action px-[26px] text-base font-semibold text-on-action hover:opacity-90 disabled:cursor-progress disabled:opacity-60 sm:h-12 sm:flex-none"
          >
            {pending ? (state === 'clockedIn' ? 'Clocking out…' : 'Clocking in…') : error ? 'Try again' : state === 'clockedIn' ? 'Clock out' : 'Clock in'}
          </button>
        </div>
      )}
    </section>
  )
}

function History({
  records,
  tz,
  openId,
  onToggle,
  onSubmit,
}: {
  records: AttendanceRecord[]
  tz: string
  openId: string | null
  onToggle: (id: string) => void
  onSubmit: (recordId: string, reason: string, newValue: CorrectionFields) => Promise<void>
}) {
  // Weeks run Monday–Sunday in the org's timezone, newest first.
  const weeks: { monday: string; rows: AttendanceRecord[] }[] = []
  for (const record of records) {
    const monday = mondayOf(localDate(record.clock_in, tz))
    const week = weeks.find((w) => w.monday === monday)
    if (week) week.rows.push(record)
    else weeks.push({ monday, rows: [record] })
  }

  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="history-heading" className="m-0 text-base font-semibold">
          Recent history
        </h2>
        <Link to="/calendar" className="px-1 py-2 text-[13px] text-text-muted underline">
          Open calendar
        </Link>
      </div>
      {weeks.length === 0 && (
        <EmptyCard title="No attendance yet" body="Your first clock-in will show here, and your streak starts counting from it." />
      )}
      {weeks.map((week) => (
        <div key={week.monday} className="flex flex-col overflow-x-auto rounded-[14px] bg-surface">
          <div className="px-4 pb-2 pt-3 font-mono text-[11px] text-text-muted sm:px-5">{formatWeek(week.monday)}</div>
          {week.rows.map((record) => {
            const day = localDate(record.clock_in, tz)
            const open = openId === record.id
            const noTimes = record.status === 'absent'
            const clockIn = noTimes ? '—' : formatTime(record.clock_in, tz)
            const missed = record.status === 'missed_clockout'
            // A missed clock-out's clock_out is the closeout job's day-boundary
            // placeholder, not a real time — show it as missing.
            const clockOut = record.clock_out && !missed ? formatTime(record.clock_out, tz) : '—'
            return (
              <Fragment key={record.id}>
                <div className={`border-t border-border ${open ? 'bg-surface-raised' : ''}`}>
                  {/* Desktop row */}
                  <div className="hidden min-h-[52px] min-w-[700px] grid-cols-[76px_190px_150px_minmax(0,1fr)_118px] items-center gap-3.5 px-5 py-1 sm:grid">
                    <span className="font-mono text-[13px]">{formatDayShort(day)}</span>
                    <span>
                      <StatusDot status={record.status} />
                    </span>
                    <span className="font-mono text-[13px]">
                      {clockIn} <span className="text-text-muted">→</span>{' '}
                      <span className={missed ? 'text-status-warning' : ''}>{clockOut}</span>
                    </span>
                    <span className="truncate text-[13px] text-text-muted">{record.notes}</span>
                    <span className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => onToggle(record.id)}
                        aria-expanded={open}
                        className={`h-9 rounded-[9px] px-3.5 text-[13px] ${open ? 'bg-surface-raised' : 'hover:bg-surface-raised'}`}
                      >
                        {open ? 'Close' : 'Correct'}
                      </button>
                    </span>
                  </div>
                  {/* Mobile row */}
                  <div className="grid min-h-[60px] grid-cols-[52px_minmax(0,1fr)_44px] items-center gap-2.5 py-1.5 pl-4 pr-1 sm:hidden">
                    <span className="whitespace-pre-line font-mono text-xs leading-[1.3]">{formatDayShort(day).replace(' ', '\n')}</span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-center justify-between gap-2">
                        <StatusDot status={record.status} />
                        {!noTimes && (
                          <span className="whitespace-nowrap font-mono text-xs text-text-muted">
                            {clockIn} → {clockOut}
                          </span>
                        )}
                      </span>
                      {record.notes && <span className="text-xs text-text-muted">{record.notes}</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggle(record.id)}
                      aria-expanded={open}
                      aria-label={`Correct ${formatDayLong(day)}`}
                      className={`flex h-11 w-11 items-center justify-center rounded-[10px] text-text-muted ${open ? 'bg-surface-raised' : ''}`}
                    >
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
                      </svg>
                    </button>
                  </div>
                  {open && (
                    <CorrectionForm
                      record={record}
                      dayLabel={formatDayLong(day)}
                      tz={tz}
                      onSubmit={(reason, newValue) => onSubmit(record.id, reason, newValue)}
                      onCancel={() => onToggle(record.id)}
                    />
                  )}
                </div>
              </Fragment>
            )
          })}
        </div>
      ))}
    </section>
  )
}

