import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, isAdmin, type Correction, type UserProfile } from '../lib/api'
import { Header } from '../components/Header'
import { CorrectionsList } from '../components/CorrectionsList'

export function CorrectionApprovals() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const me = await api.me()
      setProfile(me)
      if (!isAdmin(me)) return
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

  async function handleApprove(id: string) {
    setError(null)
    try {
      await api.approveCorrection(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve')
    }
  }

  async function handleReject(id: string) {
    setError(null)
    try {
      await api.rejectCorrection(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject')
    }
  }

  if (loading && !profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (!profile) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Something went wrong.</div>
  }

  if (!isAdmin(profile)) {
    return <Navigate to="/" replace />
  }

  const pendingCorrections = corrections.filter((c) => c.status === 'pending')
  const resolvedCorrections = corrections.filter((c) => c.status !== 'pending')

  return (
    <div className="min-h-screen">
      <Header profile={profile} />

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">Correction approvals</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <section className="mb-8">
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
            Pending
          </h2>
          {loading ? (
            <p className="font-mono text-sm text-text-muted">Loading…</p>
          ) : (
            <CorrectionsList
              corrections={pendingCorrections}
              showActions
              showRequester
              onApprove={handleApprove}
              onReject={handleReject}
            />
          )}
        </section>

        {resolvedCorrections.length > 0 && (
          <section>
            <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted">
              Resolved
            </h2>
            <CorrectionsList corrections={resolvedCorrections} showRequester />
          </section>
        )}
      </main>
    </div>
  )
}
