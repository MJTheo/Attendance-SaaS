import { useCallback, useEffect, useState } from 'react'
import { api, type CorrectionFields, type Inbox as InboxData } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { ApprovalQueue } from '../components/ApprovalQueue'
import { CorrectionForm } from '../components/CorrectionForm'
import { StatusDot, StatusIcon } from '../components/StatusDot'
import { correctionItem, correctionToast, leaveItem, leaveToast, profileItem, profileToast } from '../components/approvalItems'
import { formatDayLong, formatTime, localDate } from '../lib/datetime'

type Section = keyof InboxData

// Everything waiting on you, in one place (design B: "one queue for every
// approval"). The server decides what's waiting — the same lists its counts
// come from — so this page and the Inbox badge always agree. A section stays
// on screen after its last item is handled so the confirmation stays visible.
export function Inbox() {
  const { me, refreshNotifications, refreshMe } = useMe()
  const tz = me.org_timezone
  const [inbox, setInbox] = useState<InboxData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState<Set<Section>>(new Set())

  const load = useCallback(async () => {
    setError(null)
    try {
      setInbox(await api.inbox())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function after(section: Section) {
    setTouched((s) => new Set(s).add(section))
    await load()
    refreshNotifications()
  }

  const total = inbox ? inbox.leave.length + inbox.corrections.length + inbox.profile_changes.length + inbox.missed_clockouts.length : 0
  const show = (section: Section) => !!inbox && (inbox[section].length > 0 || touched.has(section))

  return (
    <Page title="Inbox" sub={inbox ? `${total ? `${total} waiting` : 'Nothing waiting'} · ${me.org_name}` : me.org_name} maxWidth={900}>
      {error ? (
        <LoadError message={error} onRetry={load} />
      ) : !inbox ? (
        <Skeleton />
      ) : (
        <div className="flex flex-col gap-8">
          {total === 0 && touched.size === 0 && (
            <div className="flex flex-col items-start gap-2 rounded-[16px] bg-surface p-[22px]">
              <span className="inline-flex items-center gap-2 text-base font-semibold">
                <StatusIcon status="approved" size={16} />
                All caught up
              </span>
              <span className="text-sm text-text-muted">
                Nothing needs you right now. Approvals and missed clock-outs show up here as they come in.
              </span>
            </div>
          )}
          {show('missed_clockouts') && <MissedClockouts records={inbox.missed_clockouts} tz={tz} onFiled={() => after('missed_clockouts')} />}
          {show('leave') && (
            <ApprovalQueue
              heading="Leave approvals"
              pending={inbox.leave.map((r) => leaveItem(r, tz))}
              emptyTitle="No leave left to review"
              emptyBody="Resolved requests are on the Leave approvals page."
              onDecide={async (id, approve) => {
                await (approve ? api.approveLeave(id) : api.rejectLeave(id))
                await after('leave')
              }}
              toastFor={leaveToast}
            />
          )}
          {show('corrections') && (
            <ApprovalQueue
              heading="Correction approvals"
              pending={inbox.corrections.map((c) => correctionItem(c, tz))}
              emptyTitle="No corrections left to review"
              emptyBody="Resolved requests are on the Correction approvals page."
              onDecide={async (id, approve) => {
                await (approve ? api.approveCorrection(id) : api.rejectCorrection(id))
                await after('corrections')
              }}
              toastFor={correctionToast}
            />
          )}
          {show('profile_changes') && (
            <ApprovalQueue
              heading="Profile changes"
              pending={inbox.profile_changes.map((r) => profileItem(r, tz))}
              emptyTitle="No profile changes left to review"
              emptyBody="Resolved changes are under Team › Requests."
              onDecide={async (id, approve) => {
                await (approve ? api.approveProfileEdit(id) : api.rejectProfileEdit(id))
                await after('profile_changes')
                // An approved name may be your own (sole admin) — the sidebar shows it.
                refreshMe()
              }}
              toastFor={profileToast}
            />
          )}
        </div>
      )}
    </Page>
  )
}

function MissedClockouts({ records, tz, onFiled }: { records: InboxData['missed_clockouts']; tz: string; onFiled: () => Promise<void> }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(recordId: string, reason: string, newValue: CorrectionFields) {
    await api.requestCorrection(recordId, reason, newValue)
    setOpenId(null)
    setSent(true)
    await onFiled()
  }

  return (
    <section aria-labelledby="missed-heading" className="flex flex-col gap-3.5">
      {sent && (
        <div role="status" className="flex items-center gap-2 rounded-xl bg-status-good-bg px-3.5 py-3 text-sm">
          <StatusIcon status="approved" size={15} />
          Correction sent. Your admin will see it in their Inbox.
        </div>
      )}
      <h2 id="missed-heading" className="m-0 text-base font-semibold">
        Your missed clock-outs <span className="font-mono font-medium text-text-muted">{records.length}</span>
      </h2>
      {records.length === 0 ? (
        <div className="rounded-[16px] bg-surface p-[22px] text-sm text-text-muted">Nothing left to correct.</div>
      ) : (
        <div className="rounded-[16px] bg-surface">
          {records.map((record) => {
            const day = formatDayLong(localDate(record.clock_in, tz))
            return (
              <div key={record.id} className="border-b border-border last:border-b-0">
                <div className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5">
                  <span className="w-28 font-mono text-[13px]">{day}</span>
                  <StatusDot status="missed_clockout" />
                  {/* The clock-out is the closeout job's placeholder, not a real time. */}
                  <span className="flex-1 font-mono text-[13px] text-text-muted">in {formatTime(record.clock_in, tz)} → —</span>
                  <button
                    type="button"
                    aria-expanded={openId === record.id}
                    onClick={() => setOpenId((id) => (id === record.id ? null : record.id))}
                    className={`h-9 rounded-[9px] px-3.5 text-[13px] max-sm:h-11 ${openId === record.id ? 'bg-surface-raised' : 'bg-action font-semibold text-on-action'}`}
                  >
                    {openId === record.id ? 'Close' : 'Correct'}
                  </button>
                </div>
                {openId === record.id && (
                  <CorrectionForm
                    record={record}
                    dayLabel={day}
                    tz={tz}
                    onSubmit={(reason, newValue) => submit(record.id, reason, newValue)}
                    onCancel={() => setOpenId(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
