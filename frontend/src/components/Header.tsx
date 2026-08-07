import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../lib/api'
import { Brand } from './Brand'
import { ThemeToggle } from './ThemeToggle'

export function Header({ profile }: { profile: UserProfile }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex flex-wrap items-center gap-3 sm:gap-6">
        <Brand className="pr-3 sm:border-r sm:border-border sm:pr-6" />
        <div>
          <p className="font-sans text-base font-semibold text-text sm:text-lg">{profile.name}</p>
          <p className="font-mono text-xs uppercase tracking-wide text-text-muted">{profile.role}</p>
        </div>
        <nav className="flex gap-4 font-mono text-sm">
          <Link to="/" className="text-text-muted hover:text-text">
            Dashboard
          </Link>
          {profile.role === 'admin' && (
            <>
              <Link to="/team" className="text-text-muted hover:text-text">
                Team
              </Link>
              <Link to="/analytics" className="text-text-muted hover:text-text">
                Analytics
              </Link>
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
