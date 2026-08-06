import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../lib/api'
import { Brand } from './Brand'

export function Header({ profile }: { profile: UserProfile }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-6">
        <Brand className="border-r border-border pr-6" />
        <div>
          <p className="font-sans text-lg font-semibold text-text">{profile.name}</p>
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
      <button
        onClick={() => supabase.auth.signOut()}
        className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-text-muted hover:text-text"
      >
        Sign out
      </button>
    </header>
  )
}
