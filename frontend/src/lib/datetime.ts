// ---- Org-timezone formatting ------------------------------------------------
// Every org works in its own IANA timezone (organizations.timezone), which
// defines "today" for everyone in it. These format server timestamps in that
// zone — not the viewer's device zone — so a team in Manila sees Manila times
// wherever they open the app.

const formatters = new Map<string, Intl.DateTimeFormat>()

function fmt(tz: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = tz + JSON.stringify(options)
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options })
    formatters.set(key, f)
  }
  return f
}

function parts(value: string | Date, tz: string) {
  const out: Record<string, string> = {}
  for (const p of fmt(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))) {
    out[p.type] = p.value
  }
  return { date: `${out.year}-${out.month}-${out.day}`, hour: Number(out.hour), minute: Number(out.minute) }
}

/** "08:58" */
export function formatTime(value: string | null, tz: string): string {
  if (!value) return '—'
  return fmt(tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}

/** The org-local calendar date of a timestamp, "YYYY-MM-DD". */
export function localDate(value: string | Date, tz: string): string {
  return parts(value, tz).date
}

/** Minutes since local midnight, in the org's zone. */
export function localMinutes(value: string | Date, tz: string): number {
  const p = parts(value, tz)
  return p.hour * 60 + p.minute
}

// Plain dates ("YYYY-MM-DD") carry no zone: read them at UTC noon so the
// weekday/month never shift.
function dateOnly(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00Z`)
}

/** "Wed, Oct 28" */
export function formatDayLong(isoDate: string): string {
  return fmt('UTC', { weekday: 'short', month: 'short', day: 'numeric' }).format(dateOnly(isoDate))
}

/** "Wed 28" */
export function formatDayShort(isoDate: string): string {
  const d = dateOnly(isoDate)
  return `${fmt('UTC', { weekday: 'short' }).format(d)} ${d.getUTCDate()}`
}

/** "Mon 2 Nov 2026" */
export function formatToday(tz: string): string {
  const d = dateOnly(localDate(new Date(), tz))
  return `${fmt('UTC', { weekday: 'short' }).format(d)} ${d.getUTCDate()} ${fmt('UTC', { month: 'short' }).format(d)} ${d.getUTCFullYear()}`
}

/** "Nov 2, 08:40" in the org zone */
export function formatDateTime(value: string, tz: string): string {
  return `${fmt(tz, { month: 'short', day: 'numeric' }).format(new Date(value))}, ${formatTime(value, tz)}`
}

/** "Nov 9 – Nov 11, 2026", or "Oct 23, 2026" for a single day */
export function formatDateRange(start: string, end: string): string {
  const year = dateOnly(end).getUTCFullYear()
  const md = (d: string) => fmt('UTC', { month: 'short', day: 'numeric' }).format(dateOnly(d))
  return start === end ? `${md(start)}, ${year}` : `${md(start)} – ${md(end)}, ${year}`
}

/** "Oct 26 – Nov 1" for the Monday-to-Sunday week starting on `monday`. */
export function formatWeek(monday: string): string {
  const md = (d: string) => fmt('UTC', { month: 'short', day: 'numeric' }).format(dateOnly(d))
  return `${md(monday)} – ${md(addDays(monday, 6))}`
}

export function addDays(isoDate: string, days: number): string {
  const d = dateOnly(isoDate)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The Monday on or before a date (weeks run Monday–Sunday, like working_days). */
export function mondayOf(isoDate: string): string {
  const weekday = (dateOnly(isoDate).getUTCDay() + 6) % 7
  return addDays(isoDate, -weekday)
}

/** "3h 14m" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** The UTC instant for a wall-clock date + "HH:MM" in the org's zone. */
export function zonedToUtc(isoDate: string, time: string, tz: string): string {
  const [h, m] = time.split(':').map(Number)
  const [y, mo, d] = isoDate.split('-').map(Number)
  const wall = Date.UTC(y, mo - 1, d, h, m)
  // Guess with offset 0, then correct by the zone's offset at that instant
  // (twice, so a DST boundary between guess and answer settles).
  let utc = wall
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(utc), tz)
    const [py, pm, pd] = p.date.split('-').map(Number)
    const shown = Date.UTC(py, pm - 1, pd, p.hour, p.minute)
    utc += wall - shown
  }
  return new Date(utc).toISOString()
}
