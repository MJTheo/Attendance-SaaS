import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { api, isAdmin, type Organization, type Role, type UserProfile, type Weekday } from '../lib/api'
import { DEMO_ADMIN_EMAIL } from '../lib/demo'
import { AppShell } from '../components/AppShell'

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

const HEADCOUNT_ROLES: { role: Role; label: string }[] = [
  { role: 'staff', label: 'Staff' },
  { role: 'admin', label: 'Admin' },
  { role: 'super_admin', label: 'Super admin' },
]

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const LABEL_CLASS = 'mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted'
const SECTION_CLASS = 'mb-8 rounded-lg border border-border bg-surface p-4 sm:p-6'
const SECTION_HEADING_CLASS = 'mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted'

export function Company() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      if (!isAdmin(me)) return
      setOrg(await api.organization())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleWorkingDayToggle(day: Weekday) {
    if (!org) return
    const set = new Set(org.working_days)
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
      setOrg((current) => (current ? { ...current, ...updated } : current))
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
      setOrg((current) => (current ? { ...current, ...updated } : current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings')
    } finally {
      setSavingSettings(false)
    }
  }

  function startEditingName() {
    if (!org) return
    setNameDraft(org.name)
    setNameError(null)
    setEditingName(true)
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    setNameError(null)
    setSavingName(true)
    try {
      setOrg(await api.renameOrganization(nameDraft))
      setEditingName(false)
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to rename organization')
    } finally {
      setSavingName(false)
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

  const isDemo = profile.email === DEMO_ADMIN_EMAIL
  // Rename is super-admin-only (enforced by the API and a DB trigger too);
  // working days/timezone stay editable by any admin.
  const canRename = profile.role === 'super_admin' && !isDemo

  return (
    <AppShell profile={profile}>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">Company</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        {org && (
          <>
            <section className={SECTION_CLASS}>
              <h2 className={SECTION_HEADING_CLASS}>Organization</h2>

              <span className={LABEL_CLASS}>Name</span>
              {editingName ? (
                <form onSubmit={handleRename} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    maxLength={100}
                    required
                    autoFocus
                    disabled={savingName}
                    className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good disabled:opacity-50 sm:max-w-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingName || !nameDraft.trim()}
                      className="rounded-md border border-status-good bg-status-good px-3 py-1.5 font-mono text-xs text-bg disabled:opacity-50"
                    >
                      {savingName ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      disabled={savingName}
                      className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-text-muted hover:text-text disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <p className="font-sans text-base font-semibold text-text">{org.name}</p>
                  {canRename && (
                    <button
                      type="button"
                      onClick={startEditingName}
                      className="rounded-md border border-border px-2 py-0.5 font-mono text-xs text-text-muted hover:text-text"
                    >
                      Rename
                    </button>
                  )}
                </div>
              )}
              {nameError && <p className="mt-2 font-mono text-xs text-status-warning">{nameError}</p>}

              <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt className={LABEL_CLASS}>Plan</dt>
                  {/* Bordered pill, not a StatusDot color — plan isn't attendance status. */}
                  <dd>
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs text-text">
                      {org.plan}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={LABEL_CLASS}>Created</dt>
                  <dd className="font-mono text-sm text-text">{formatDate(org.created_at)}</dd>
                </div>
                <div>
                  <dt className={LABEL_CLASS}>Headcount</dt>
                  <dd className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm text-text">
                    {HEADCOUNT_ROLES.map(({ role, label }) => (
                      <span key={role}>
                        {org.member_counts[role]} <span className="text-text-muted">{label.toLowerCase()}</span>
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </section>

            <section className={SECTION_CLASS}>
              <h2 className={SECTION_HEADING_CLASS}>Settings</h2>
              <span className={LABEL_CLASS}>Working days</span>
              {!isDemo ? (
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const active = org.working_days.includes(day.value)
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
                <p className="font-mono text-sm text-text">{describeWorkingDays(org.working_days)}</p>
              )}
              <p className="mt-2 font-mono text-xs text-text-muted">
                Controls which weekdays show up in analytics and which days count toward streaks.
              </p>

              <span className={`${LABEL_CLASS} mt-4`}>Timezone</span>
              {!isDemo ? (
                <select
                  value={org.timezone}
                  onChange={(e) => handleTimezoneChange(e.target.value)}
                  disabled={savingSettings}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good disabled:opacity-50 sm:w-auto"
                >
                  {!TIMEZONES.includes(org.timezone) && <option value={org.timezone}>{org.timezone}</option>}
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="font-mono text-sm text-text">{org.timezone}</p>
              )}
              <p className="mt-2 font-mono text-xs text-text-muted">
                Defines what "today" means for clock-in caps, streaks, and the daily closeout job — not
                each viewer's own device timezone.
              </p>
            </section>
          </>
        )}
      </main>
    </AppShell>
  )
}
