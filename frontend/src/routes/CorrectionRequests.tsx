import { useCallback, useEffect, useState } from 'react'
import { api, type Correction } from '../lib/api'
import { Skeleton } from '../components/Skeleton'
import { useMe } from '../lib/me-context'
import { CorrectionsList } from '../components/CorrectionsList'

export function CorrectionRequests() {
  const { me: profile } = useMe()
  const [loaded, setLoaded] = useState(false)
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setCorrections(await api.corrections())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The endpoint is RLS-scoped so admins see the whole org's requests, not
  // just their own (that's what Correction Approvals needs) — filter to "mine".
  const myCorrections = corrections.filter((c) => c.requested_by === profile.id)

  if (!loaded) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton />
      </main>
    )
  }

  return (
    <>
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">Correction requests</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <p className="mb-3 font-mono text-xs text-text-muted">
          To request a correction, use the "Correct" link next to a record in your dashboard history.
        </p>
        <CorrectionsList corrections={myCorrections} />
      </main>
    </>
  )
}
