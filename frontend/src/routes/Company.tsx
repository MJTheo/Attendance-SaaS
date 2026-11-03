import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { api, isAdmin, type Organization, type Weekday } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { StatusIcon } from '../components/StatusDot'

const WEEKDAYS: { value: Weekday; short: string; full: string }[] = [
  { value: 0, short: 'Mon', full: 'Monday' },
  { value: 1, short: 'Tue', full: 'Tuesday' },
  { value: 2, short: 'Wed', full: 'Wednesday' },
  { value: 3, short: 'Thu', full: 'Thursday' },
  { value: 4, short: 'Fri', full: 'Friday' },
  { value: 5, short: 'Sat', full: 'Saturday' },
  { value: 6, short: 'Sun', full: 'Sunday' },
]

// IANA zone names, from the browser itself — avoids shipping/maintaining a
// static list. Falls back to a small curated set on older browsers without
// Intl.supportedValuesOf (Safari < 17, e.g.).
const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Manila', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney']

// "Asia/Manila (UTC+8)" — the zone's offset right now.
function timezoneLabel(tz: string): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
    return name ? `${tz} (${name.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+0')})` : tz
  } catch {
    return tz
  }
}

function sameDays(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i])
}

const LOCK_ICON = 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4'

export function Company() {
  const { me, refreshMe } = useMe()
  const isDemo = me.org_plan === 'demo'
  const [org, setOrg] = useState<Organization | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOrg(await api.organization())
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

  return (
    <Page title="Company" sub="Organization settings" maxWidth={900} demo={isDemo}>
      {!loaded ? (
        <Skeleton />
      ) : error || !org ? (
        <LoadError message={error ?? undefined} onRetry={load} />
      ) : (
        <div className="flex flex-col gap-[18px]">
          <OrgCard
            org={org}
            // Rename is super-admin-only (enforced by the API and a DB trigger too).
            canRename={me.role === 'super_admin' && !isDemo}
            lockText={isDemo ? 'Read-only in the demo' : me.role !== 'super_admin' ? 'Only a super admin can rename the org' : null}
            onRenamed={(updated) => {
              setOrg(updated)
              refreshMe()
            }}
          />
          <SettingsCard
            org={org}
            readOnly={isDemo}
            onSaved={(updated) => {
              setOrg((current) => (current ? { ...current, ...updated } : current))
              // "Today", the calendar and the sidebar all follow these.
              refreshMe()
            }}
          />
        </div>
      )}
    </Page>
  )
}

function OrgCard({
  org,
  canRename,
  lockText,
  onRenamed,
}: {
  org: Organization
  canRename: boolean
  lockText: string | null
  onRenamed: (org: Organization) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRename(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      onRenamed(await api.renameOrganization(draft))
      setRenaming(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename the organization')
    } finally {
      setSaving(false)
    }
  }

  const created = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(org.created_at))
  const plan = `${org.plan.charAt(0).toUpperCase()}${org.plan.slice(1)} plan`
  const heads = [
    { n: org.member_counts.super_admin, label: 'Super admin' },
    { n: org.member_counts.admin, label: 'Admins' },
    { n: org.member_counts.staff, label: 'Staff' },
  ]

  return (
    <section aria-labelledby="org-heading" className="flex flex-col gap-4 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
      <div className="flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
          <span className="text-[13px] text-text-muted">Organization name</span>
          {renaming ? (
            <form onSubmit={handleRename} className="flex flex-wrap gap-2">
              <label htmlFor="org-name" className="sr-only">
                Organization name
              </label>
              <input
                id="org-name"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={100}
                required
                autoFocus
                disabled={saving}
                className="h-12 min-w-0 flex-[1_1_280px] rounded-[10px] border border-text bg-bg px-3.5 text-base text-text shadow-[0_0_0_3px_var(--color-ring)] outline-none"
              />
              <button type="button" onClick={() => setRenaming(false)} disabled={saving} className="h-12 rounded-[10px] bg-surface-raised px-4">
                Cancel
              </button>
              <button type="submit" disabled={saving || !draft.trim()} className="h-12 rounded-[10px] bg-action px-5 font-semibold text-on-action disabled:opacity-60">
                {saving ? 'Saving…' : 'Save name'}
              </button>
            </form>
          ) : (
            <h2 id="org-heading" className="m-0 text-2xl font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]">
              {org.name}
            </h2>
          )}
          {error && (
            <p role="alert" className="m-0 text-[13px] text-error">
              {error}
            </p>
          )}
          <span className="flex flex-wrap items-center gap-2.5 text-[13px] text-text-muted">
            <span className="inline-flex h-6 items-center rounded-xl border border-dashed border-border-strong px-2.5 text-text">{plan}</span>
            <span className="font-mono text-xs">Created {created}</span>
          </span>
        </div>
        {canRename && !renaming && (
          <button
            type="button"
            onClick={() => {
              setDraft(org.name)
              setError(null)
              setRenaming(true)
            }}
            className="h-11 rounded-[10px] bg-surface-raised px-4"
          >
            Rename
          </button>
        )}
        {lockText && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={LOCK_ICON} />
            </svg>
            {lockText}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {heads.map((h) => (
          <div key={h.label} className="flex flex-col gap-0.5 rounded-xl bg-bg p-3.5">
            <span className="font-mono text-2xl font-medium">{h.n}</span>
            <span className="text-[13px] text-text-muted">{h.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function SettingsCard({ org, readOnly, onSaved }: { org: Organization; readOnly: boolean; onSaved: (org: Pick<Organization, 'working_days' | 'timezone'>) => void }) {
  const [days, setDays] = useState<Weekday[]>(org.working_days)
  const [timezone, setTimezone] = useState(org.timezone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const zones = useMemo(() => {
    const list = TIMEZONES.includes(org.timezone) ? TIMEZONES : [org.timezone, ...TIMEZONES]
    return list.map((tz) => ({ tz, label: timezoneLabel(tz) }))
  }, [org.timezone])

  const dirty = !sameDays(days, org.working_days) || timezone !== org.timezone

  function toggle(day: Weekday) {
    setSaved(false)
    setDays((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b)))
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSaving(true)
    try {
      const patch: { working_days?: Weekday[]; timezone?: string } = {}
      if (!sameDays(days, org.working_days)) patch.working_days = days
      if (timezone !== org.timezone) patch.timezone = timezone
      onSaved(await api.updateOrgSettings(patch))
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} aria-labelledby="settings-heading" className="flex flex-col gap-[18px] rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
      <h2 id="settings-heading" className="m-0 text-lg font-semibold">
        Settings
      </h2>
      <div className="flex flex-col gap-2">
        <span id="working-days-label" className="text-[13px] text-text-muted">
          Working days
        </span>
        <div role="group" aria-labelledby="working-days-label" className="grid max-w-[420px] grid-cols-7 gap-1.5">
          {WEEKDAYS.map((day) => {
            const on = days.includes(day.value)
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={on}
                aria-label={day.full}
                disabled={readOnly}
                onClick={() => toggle(day.value)}
                className={`h-11 rounded-[10px] text-[13px] ${
                  on ? (readOnly ? 'bg-surface-raised font-semibold text-text' : 'bg-action font-semibold text-on-action') : 'bg-bg text-text-muted'
                } ${readOnly ? 'cursor-not-allowed' : ''}`}
              >
                {day.short}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-text-muted">Only working days count toward streaks, late rates and absences.</span>
      </div>
      <label className="flex max-w-[420px] flex-col gap-1.5">
        <span className="text-[13px] text-text-muted">Timezone</span>
        <select
          value={timezone}
          disabled={readOnly}
          onChange={(e) => {
            setSaved(false)
            setTimezone(e.target.value)
          }}
          className="h-[46px] rounded-[10px] border border-border bg-bg px-3 text-text disabled:cursor-not-allowed disabled:text-text-muted"
        >
          {zones.map((z) => (
            <option key={z.tz} value={z.tz}>
              {z.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-text-muted">"Today" for everyone in the org follows this timezone.</span>
      </label>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-error">
          {error}
        </p>
      )}
      {saved && !dirty && (
        <p role="status" className="m-0 flex items-center gap-2 text-sm">
          <StatusIcon status="approved" size={15} />
          Settings saved.
        </p>
      )}
      <button
        type="submit"
        disabled={readOnly || !dirty || saving || days.length === 0}
        className={`h-12 self-stretch rounded-[10px] px-[22px] font-semibold sm:self-start ${
          readOnly ? 'cursor-not-allowed bg-surface-raised text-text-muted' : 'bg-action text-on-action disabled:opacity-50'
        }`}
      >
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
