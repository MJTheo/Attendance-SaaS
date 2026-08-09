import type { ReactNode } from 'react'
import type { UserProfile } from '../lib/api'
import { Sidebar } from './Sidebar'

export function AppShell({ profile, children }: { profile: UserProfile; children: ReactNode }) {
  return (
    <div className="min-h-screen sm:flex">
      <Sidebar profile={profile} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
