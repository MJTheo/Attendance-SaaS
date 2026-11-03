import type { ReactNode } from 'react'

// Page title (30px desktop / 28px mobile) with a mono sub-line, and an
// optional slot on the right (e.g. the dashboard's streak).
export function PageHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] sm:text-[30px]">{title}</h1>
        {sub && <div className="font-mono text-xs text-text-muted">{sub}</div>}
      </div>
      {right}
    </header>
  )
}
