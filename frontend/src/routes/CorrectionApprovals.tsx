import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, isAdmin, type Correction } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { ApprovalQueue } from '../components/ApprovalQueue'
import { FieldRows } from '../components/RequestCard'
import { formatDateTime } from '../lib/datetime'
import { correctionCard, correctionSummary } from '../lib/requests'

export function CorrectionApprovals() {
  const { me, refreshNotifications } = useMe()
  const tz = me.org_timezone
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
    if (isAdmin(me)) load()
  }, [me, load])

  if (!isAdmin(me)) return <Navigate to="/" replace />

  async function decide(id: string, approve: boolean) {
    await (approve ? api.approveCorrection(id) : api.rejectCorrection(id))
    await load()
    refreshNotifications()
  }

  const pending = corrections
    .filter((c) => c.status === 'pending')
    .map((c) => {
      const card = correctionCard(c, tz)
      return {
        id: c.id,
        who: c.requested_by_name ?? 'Someone',
        meta: `Correction · ${card.title} · sent ${formatDateTime(c.created_at, tz)}`,
        body: <FieldRows fields={card.fields} />,
        reason: c.reason,
      }
    })
  const resolved = corrections
    .filter((c) => c.status !== 'pending')
    .map((c) => ({ id: c.id, who: c.requested_by_name ?? 'Someone', summary: correctionSummary(c, tz), status: c.status }))

  return (
    <Page title="Correction approvals" sub={me.org_name} maxWidth={900}>
      {!loaded ? (
        <Skeleton />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <ApprovalQueue
          heading="Waiting for you"
          pending={pending}
          resolved={resolved}
          emptyTitle="All caught up"
          emptyBody="New requests land here and in your Inbox. Resolved ones stay below for reference."
          onDecide={decide}
          toastFor={(item, approved) =>
            approved
              ? `Approved. ${item.who}’s record is updated, and the old values are kept in the audit trail.`
              : `Rejected. ${item.who} will see it in their requests.`
          }
        />
      )}
    </Page>
  )
}
