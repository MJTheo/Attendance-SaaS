export type Granularity = 'day' | 'week' | 'month'

function atMidnight(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

// Monday-first week, matching the backend's working_days convention
// (Monday = weekday 0).
function startOfWeek(d: Date): Date {
  const copy = atMidnight(d)
  const isoWeekday = (copy.getDay() + 6) % 7 // Mon=0 .. Sun=6
  copy.setDate(copy.getDate() - isoWeekday)
  return copy
}

export function periodRange(reference: Date, granularity: Granularity): { start: Date; end: Date } {
  if (granularity === 'day') {
    const start = atMidnight(reference)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }
  if (granularity === 'week') {
    const start = startOfWeek(reference)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1)
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 1)
  return { start, end }
}

export function shiftPeriod(reference: Date, granularity: Granularity, delta: number): Date {
  const copy = new Date(reference)
  if (granularity === 'day') copy.setDate(copy.getDate() + delta)
  else if (granularity === 'week') copy.setDate(copy.getDate() + delta * 7)
  else copy.setMonth(copy.getMonth() + delta)
  return copy
}

// Mon-first 6x7 month grid. Cells outside the month are null (rendered as
// blank padding) rather than showing adjacent-month dates, since the
// calendar APIs only return data for the requested month anyway.
export function monthGridCells(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const leadingBlanks = (first.getDay() + 6) % 7 // Mon=0 .. Sun=6

  const cells: (Date | null)[] = []
  for (let i = 0; i < leadingBlanks; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month - 1, day))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatPeriodLabel(reference: Date, granularity: Granularity): string {
  const { start, end } = periodRange(reference, granularity)
  if (granularity === 'day') {
    return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }
  if (granularity === 'week') {
    const last = new Date(end)
    last.setDate(last.getDate() - 1)
    const sameMonth = start.getMonth() === last.getMonth()
    const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const endLabel = last.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
    return `Week of ${startLabel}–${endLabel}, ${last.getFullYear()}`
  }
  return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
