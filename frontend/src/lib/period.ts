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
