import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAdmin, type UserProfile } from '../lib/api'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'font-semibold text-status-good' : 'text-text-muted hover:text-text'
}

export function Header({ profile }: { profile: UserProfile }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <header className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <Brand className="pr-3 sm:border-r sm:border-border sm:pr-6" />
          <div>
            <p className="font-sans text-base font-semibold text-text sm:text-lg">{profile.name}</p>
            <p className="font-mono text-xs uppercase tracking-wide text-text-muted">
              {profile.role.replace('_', ' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-text-muted hover:text-text"
          >
            Sign out
          </button>
          <button
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            className="rounded-md border border-border p-1.5 text-text-muted hover:text-text sm:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M2 4.5H16M2 9H16M2 13.5H16"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <nav
        className={`${menuOpen ? 'flex' : 'hidden'} mt-3 flex-col gap-3 font-mono text-sm sm:mt-3 sm:flex sm:flex-row sm:flex-wrap sm:items-center sm:gap-4`}
      >
        <NavLink to="/" end className={navLinkClass} onClick={closeMenu}>
          Dashboard
        </NavLink>
        <NavLink to="/calendar" className={navLinkClass} onClick={closeMenu}>
          Calendar
        </NavLink>
        <NavLink to="/requests/leave" className={navLinkClass} onClick={closeMenu}>
          Leave
        </NavLink>
        <NavLink to="/requests/corrections" className={navLinkClass} onClick={closeMenu}>
          Corrections
        </NavLink>
        {isAdmin(profile) && (
          <>
            <NavLink to="/approvals/leave" className={navLinkClass} onClick={closeMenu}>
              Leave approvals
            </NavLink>
            <NavLink to="/approvals/corrections" className={navLinkClass} onClick={closeMenu}>
              Correction approvals
            </NavLink>
            <NavLink to="/team" className={navLinkClass} onClick={closeMenu}>
              Team
            </NavLink>
            <NavLink to="/analytics" className={navLinkClass} onClick={closeMenu}>
              Analytics
            </NavLink>
          </>
        )}
      </nav>
    </header>
  )
}
