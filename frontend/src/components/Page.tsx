import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'
import { DemoNote } from './DemoNote'

// Every signed-in screen: the design's page padding, title + mono sub-line,
// an optional read-only note for the demo org, and a per-screen max width.
export function Page({
  title,
  sub,
  right,
  maxWidth,
  demo = false,
  children,
}: {
  title: ReactNode
  sub?: ReactNode
  right?: ReactNode
  maxWidth?: number
  demo?: boolean
  children: ReactNode
}) {
  return (
    <main className="min-w-0 px-4 pb-10 pt-[22px] sm:px-12 sm:pb-14 sm:pt-9">
      <div className="flex flex-col gap-5 sm:gap-7" style={maxWidth ? { maxWidth } : undefined}>
        <PageHeader title={title} sub={sub} right={right} />
        {demo && <DemoNote />}
        {children}
      </div>
    </main>
  )
}
