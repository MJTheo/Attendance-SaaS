import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError, type AttendanceRecord, type CorrectionFields, type DayDetail, type UserProfile } from '../lib/api'
import { StatusDot, formatStatusLabel, statusToVariant } from '../components/StatusDot'
import { AppShell } from '../components/AppShell'
import { CorrectionRequestForm } from '../components/CorrectionRequestForm'
import { formatTimestamp } from '../lib/datetime'
import { Onboarding } from './Onboarding'

export function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [history, setHistory] = useState<AttendanceRecord[]>([])
  const [streak, setStreak] = useState(0)
  const [todayDetail, setTodayDetail] = useState<DayDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [notes, setNotes] = useState('')
  const [correctingRecordId, setCorrectingRecordId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    const [historyData, streakData, todayData] = await Promise.all([api.history(), api.streak(), api.myToday()])
    setHistory(historyData)
    setStreak(streakData.current_streak)
    setTodayDetail(todayData)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      setNeedsOnboarding(false)
      await loadHistory()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNeedsOnboarding(true)
      } else {
        setActionError(err instanceof Error ? err.message : 'Failed to load')
      }
    } finally {
      setLoading(false)
    }
  }, [loadHistory])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (needsOnboarding) {
    return (
      <Onboarding
        onDone={(newProfile) => {
          setProfile(newProfile)
          setNeedsOnboarding(false)
          loadHistory()
        }}
      />
    )
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  // status !== 'absent' excludes auto-absent records — those also carry
  // clock_out = null by design (no clock-in ever happened), same reason
  // the backend's AttendanceRepository.get_open_record() excludes them.
  const openRecord = history.find((record) => record.clock_out === null && record.status !== 'absent') ?? null
  // A closed record for today (the org's own local today, not the device's)
  // means clock-in is capped for the day — showing "Clock in" at that point
  // would just 409. todayDetail is null-safe for every other case (no
  // record yet, on leave today) since those aren't "done for today".
  const doneForToday = !openRecord && todayDetail?.clock_out != null

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
    setCorrectingRecordId(null)
  }

  return (
    <AppShell profile={profile}>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-8 rounded-lg border border-border bg-surface p-6 text-center sm:p-10">
          <div className="mb-2 flex justify-center">
            <StatusDot
              variant={openRecord ? 'good' : 'neutral'}
              label={openRecord ? 'Clocked in' : 'Not clocked in'}
            />
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {openRecord && (
              <span className="font-mono text-xs text-text-muted">since {formatTimestamp(openRecord.clock_in)}</span>
            )}
            <span className="font-mono text-xs text-text-muted">
              Streak: <span className="text-status-good">{streak}</span> {streak === 1 ? 'day' : 'days'}
            </span>
          </div>
          <p className="mb-6 font-mono text-xs text-text-muted">
            Need time off or a correction?{' '}
            <Link to="/requests" className="text-text underline hover:text-status-good">
              Go to Requests
            </Link>
          </p>

          {actionError && <p className="mb-4 font-mono text-sm text-status-warning">{actionError}</p>}

          {openRecord ? (
            <div className="mx-auto flex max-w-sm flex-col gap-3">
              <input
                type="text"
                placeholder="Note (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="rounded-md border border-border bg-bg px-4 py-3 text-sm text-text outline-none focus:border-status-good"
              />
              <button
                onClick={handleClockOut}
                disabled={actionPending}
                className="rounded-lg bg-status-warning px-6 py-4 text-lg font-semibold text-bg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 sm:py-5 sm:text-xl"
              >
                Clock out
              </button>
            </div>
          ) : doneForToday ? (
            <div className="mx-auto max-w-sm rounded-lg border border-border bg-bg px-6 py-4 text-sm text-text-muted sm:py-5">
              You're done for today. Made a mistake?{' '}
              <Link to="/requests/corrections" className="text-text underline hover:text-status-good">
                Request a correction
              </Link>
              .
            </div>
          ) : (
            <button
              onClick={handleClockIn}
              disabled={actionPending}
              className="mx-auto block w-full max-w-sm rounded-lg bg-status-good px-6 py-4 text-lg font-semibold text-bg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 sm:py-5 sm:text-xl"
            >
              Clock in
            </button>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Recent history
          </h2>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse whitespace-nowrap font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-2 py-2 font-normal sm:px-4">Status</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Clock in</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Clock out</th>
                  <th className="px-2 py-2 font-normal sm:px-4">Notes</th>
                  <th className="px-2 py-2 font-normal sm:px-4"></th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-text-muted">
                      No records yet.
                    </td>
                  </tr>
                )}
                {history.map((record) => (
                  <Fragment key={record.id}>
                    <tr className="border-b border-border last:border-0">
                      <td className="px-2 py-2 sm:px-4">
                        <StatusDot variant={statusToVariant(record.status)} label={formatStatusLabel(record.status)} />
                      </td>
                      <td className="px-2 py-2 text-text sm:px-4">{formatTimestamp(record.clock_in)}</td>
                      <td className="px-2 py-2 text-text sm:px-4">{formatTimestamp(record.clock_out)}</td>
                      <td className="px-2 py-2 text-text-muted sm:px-4">{record.notes ?? '—'}</td>
                      <td className="px-2 py-2 text-right sm:px-4">
                        <button
                          onClick={() => setCorrectingRecordId(correctingRecordId === record.id ? null : record.id)}
                          className="font-mono text-xs text-text-muted hover:text-text"
                        >
                          Correct
                        </button>
                      </td>
                    </tr>
                    {correctingRecordId === record.id && (
                      <tr>
                        <td colSpan={5} className="p-0">
                          <CorrectionRequestForm
                            record={record}
                            onCancel={() => setCorrectingRecordId(null)}
                            onSubmit={(reason, newValue) => handleRequestCorrection(record.id, reason, newValue)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppShell>
  )
}
