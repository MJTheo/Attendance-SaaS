import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAdmin, type UserProfile } from '../lib/api'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-semibold text-status-good' : 'text-text-muted hover:text-text'
}

export function Header({ profile }: { profile: UserProfile }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center gap-3 sm:gap-6">
        <Brand className="pr-3 sm:border-r sm:border-border sm:pr-6" />
        <div>
          <p className="font-sans text-base font-semibold text-text sm:text-lg">{profile.name}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-text-muted">
            {profile.role.replace('_', ' ')}
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 font-mono text-sm">
          <NavLink to="/" end className={navLinkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/calendar" className={navLinkClass}>
            Calendar
          </NavLink>
          <NavLink to="/requests" className={navLinkClass}>
            Requests
          </NavLink>
          {isAdmin(profile) && (
            <>
              <NavLink to="/approvals" className={navLinkClass}>
                Approvals
              </NavLink>
              <NavLink to="/team" className={navLinkClass}>
                Team
              </NavLink>
              <NavLink to="/analytics" className={navLinkClass}>
                Analytics
              </NavLink>
            </>
          )}
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-text-muted hover:text-text"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
