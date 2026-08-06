import { Fragment, useCallback, useEffect, useState } from 'react'
import { api, ApiError, type AttendanceRecord, type Correction, type CorrectionFields, type UserProfile } from '../lib/api'
import { StatusDot, statusToVariant } from '../components/StatusDot'
import { Header } from '../components/Header'
import { CorrectionRequestForm } from '../components/CorrectionRequestForm'
import { CorrectionsList } from '../components/CorrectionsList'
import { formatTimestamp } from '../lib/datetime'
import { Onboarding } from './Onboarding'

export function Dashboard() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [history, setHistory] = useState<AttendanceRecord[]>([])
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [notes, setNotes] = useState('')
  const [correctingRecordId, setCorrectingRecordId] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setHistory(await api.history())
  }, [])

  const loadCorrections = useCallback(async () => {
    setCorrections(await api.corrections())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      setNeedsOnboarding(false)
      await Promise.all([loadHistory(), loadCorrections()])
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNeedsOnboarding(true)
      } else {
        setActionError(err instanceof Error ? err.message : 'Failed to load')
      }
    } finally {
      setLoading(false)
    }
  }, [loadHistory, loadCorrections])

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
          loadCorrections()
        }}
      />
    )
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  const openRecord = history.find((record) => record.clock_out === null) ?? null
  const myCorrections = corrections.filter((c) => c.requested_by === profile.id)

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
    await loadCorrections()
  }

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-2xl px-6 py-8">
        <section className="mb-8 rounded-lg border border-border bg-surface p-6">
          <div className="mb-4 flex items-center justify-between">
            <StatusDot
              variant={openRecord ? 'good' : 'neutral'}
              label={openRecord ? 'Clocked in' : 'Not clocked in'}
            />
            {openRecord && (
              <span className="font-mono text-xs text-text-muted">since {formatTimestamp(openRecord.clock_in)}</span>
            )}
          </div>

          {actionError && <p className="mb-4 font-mono text-sm text-status-warning">{actionError}</p>}

          {openRecord ? (
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Note (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good"
              />
              <button
                onClick={handleClockOut}
                disabled={actionPending}
                className="rounded-md bg-status-warning px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Clock out
              </button>
            </div>
          ) : (
            <button
              onClick={handleClockIn}
              disabled={actionPending}
              className="w-full rounded-md bg-status-good px-4 py-2 font-medium text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
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
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2 font-normal">Clock in</th>
                  <th className="px-4 py-2 font-normal">Clock out</th>
                  <th className="px-4 py-2 font-normal">Notes</th>
                  <th className="px-4 py-2 font-normal"></th>
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
                      <td className="px-4 py-2">
                        <StatusDot variant={statusToVariant(record.status)} label={record.status} />
                      </td>
                      <td className="px-4 py-2 text-text">{formatTimestamp(record.clock_in)}</td>
                      <td className="px-4 py-2 text-text">{formatTimestamp(record.clock_out)}</td>
                      <td className="px-4 py-2 text-text-muted">{record.notes ?? '—'}</td>
                      <td className="px-4 py-2 text-right">
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

        <section>
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            My correction requests
          </h2>
          <CorrectionsList corrections={myCorrections} />
        </section>
      </main>
    </div>
  )
}
