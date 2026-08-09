import { useCallback, useEffect, useState } from 'react'
import { api, type Correction, type UserProfile } from '../lib/api'
import { AppShell } from '../components/AppShell'
import { CorrectionsList } from '../components/CorrectionsList'

export function CorrectionRequests() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      setCorrections(await api.corrections())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  // The endpoint is RLS-scoped so admins see the whole org's requests, not
  // just their own (that's what Correction Approvals needs) — filter to "mine".
  const myCorrections = corrections.filter((c) => c.requested_by === profile.id)

  return (
    <AppShell profile={profile}>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">Correction requests</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <p className="mb-3 font-mono text-xs text-text-muted">
          To request a correction, use the "Correct" link next to a record in your dashboard history.
        </p>
        <CorrectionsList corrections={myCorrections} />
      </main>
    </AppShell>
  )
}
