import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, isAdmin, type LeaveRequest } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { ApprovalQueue } from '../components/ApprovalQueue'
import { leaveItem, leaveToast } from '../components/approvalItems'
import { leaveSummary } from '../lib/requests'

export function LeaveApprovals() {
  const { me, refreshNotifications } = useMe()
  const tz = me.org_timezone
  const [requests, setRequests] = useState<LeaveRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRequests(await api.leaveRequests())
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
    await (approve ? api.approveLeave(id) : api.rejectLeave(id))
    await load()
    refreshNotifications()
  }

  const pending = requests.filter((r) => r.status === 'pending').map((r) => leaveItem(r, tz))
  const resolved = requests
    .filter((r) => r.status !== 'pending')
    .map((r) => ({ id: r.id, who: r.requested_by_name ?? 'Someone', summary: leaveSummary(r), status: r.status }))

  return (
    <Page title="Leave approvals" sub={me.org_name} maxWidth={900}>
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
          toastFor={leaveToast}
        />
      )}
    </Page>
  )
}
