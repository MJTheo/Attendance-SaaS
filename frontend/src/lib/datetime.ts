export function formatTimestamp(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// datetime-local inputs use "YYYY-MM-DDTHH:mm" in the browser's local time —
// this round-trips an ISO timestamp into that format for prefilling a form.
export function toDatetimeLocal(value: string | null) {
  if (!value) return ''
  const d = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString()
}
