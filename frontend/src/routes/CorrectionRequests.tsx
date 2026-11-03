import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Correction } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { EmptyCard, RequestCard } from '../components/RequestCard'
import { correctionCard } from '../lib/requests'

export function CorrectionRequests() {
  const { me } = useMe()
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
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
  const mine = corrections.filter((c) => c.requested_by === me.id)

  return (
    <Page title="Corrections" sub="Your requests" maxWidth={860}>
      {!loaded ? (
        <Skeleton />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
          <h2 id="mine-heading" className="m-0 text-base font-semibold">
            Your correction requests
          </h2>
          {mine.length === 0 ? (
            <EmptyCard title="No correction requests" body="Spotted a wrong day? Use Correct on any row of your Dashboard history.">
              <Link to="/" className="flex h-11 items-center rounded-[10px] bg-action px-[18px] font-semibold text-on-action">
                Go to Dashboard
              </Link>
            </EmptyCard>
          ) : (
            mine.map((correction) => <RequestCard key={correction.id} {...correctionCard(correction, me.org_timezone)} />)
          )}
        </section>
      )}
    </Page>
  )
}
