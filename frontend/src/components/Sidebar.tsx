import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { isAdmin, type UserProfile } from '../lib/api'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-2 py-1.5 text-left transition-colors ${
    isActive ? 'bg-status-good/10 font-semibold text-status-good' : 'text-text-muted hover:bg-border/40 hover:text-text'
  }`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      aria-hidden="true"
    >
      <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Leave/Corrections combine "my requests" and "approvals" into one nav
// entry for admins (there are two places to go); staff only ever have one
// place to go, so they get a plain link instead of a pointless one-item menu.
function NavGroup({
  label,
  requestPath,
  approvalPath,
  onNavigate,
}: {
  label: string
  requestPath: string
  approvalPath: string
  onNavigate: () => void
}) {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = location.pathname.startsWith(requestPath) || location.pathname.startsWith(approvalPath)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function go() {
    setOpen(false)
    onNavigate()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${
          active ? 'bg-status-good/10 font-semibold text-status-good' : 'text-text-muted hover:bg-border/40 hover:text-text'
        }`}
      >
        {label}
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 flex w-44 flex-col gap-0.5 rounded-md border border-border bg-surface p-1 shadow-lg sm:left-full sm:top-0 sm:ml-1 sm:mt-0">
          <NavLink to={requestPath} className={navLinkClass} onClick={go}>
            My requests
          </NavLink>
          <NavLink to={approvalPath} className={navLinkClass} onClick={go}>
            Approvals
          </NavLink>
        </div>
      )}
    </div>
  )
}

function NavItems({ profile, onNavigate }: { profile: UserProfile; onNavigate: () => void }) {
  const admin = isAdmin(profile)
  return (
    <nav className="flex flex-col gap-1 font-mono text-sm">
      <NavLink to="/" end className={navLinkClass} onClick={onNavigate}>
        Dashboard
      </NavLink>
      <NavLink to="/calendar" className={navLinkClass} onClick={onNavigate}>
        Calendar
      </NavLink>
      {admin ? (
        <NavGroup label="Leave" requestPath="/requests/leave" approvalPath="/approvals/leave" onNavigate={onNavigate} />
      ) : (
        <NavLink to="/requests/leave" className={navLinkClass} onClick={onNavigate}>
          Leave
        </NavLink>
      )}
      {admin ? (
        <NavGroup
          label="Corrections"
          requestPath="/requests/corrections"
          approvalPath="/approvals/corrections"
          onNavigate={onNavigate}
        />
      ) : (
        <NavLink to="/requests/corrections" className={navLinkClass} onClick={onNavigate}>
          Corrections
        </NavLink>
      )}
      {admin && (
        <>
          <NavLink to="/team" className={navLinkClass} onClick={onNavigate}>
            Team
          </NavLink>
          <NavLink to="/analytics" className={navLinkClass} onClick={onNavigate}>
            Analytics
          </NavLink>
        </>
      )}
    </nav>
  )
}

export function Sidebar({ profile }: { profile: UserProfile }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile: slim top bar + hamburger, sidebar itself becomes a slide-in drawer below */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            className="rounded-md border border-border p-1.5 text-text-muted hover:text-text"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M2 4.5H16M2 9H16M2 13.5H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-6 border-r border-border bg-bg p-4 transition-transform duration-200 sm:sticky sm:top-0 sm:z-auto sm:h-screen sm:w-60 sm:translate-x-0 sm:p-5 sm:transition-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <Brand />
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-md p-1 text-text-muted hover:text-text sm:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div>
          <p className="font-sans text-base font-semibold text-text">{profile.name}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-text-muted">{profile.role.replace('_', ' ')}</p>
        </div>

        <NavItems profile={profile} onNavigate={() => setMobileOpen(false)} />

        <div className="mt-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex-1 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-text-muted hover:text-text"
          >
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
