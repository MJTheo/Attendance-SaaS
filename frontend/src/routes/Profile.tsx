import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type ProfileEditRequest } from '../lib/api'
import { useMe } from '../lib/me-context'
import { Page } from '../components/Page'
import { LoadError, Skeleton } from '../components/Skeleton'
import { StatusDot, StatusIcon } from '../components/StatusDot'
import { formatDateTime } from '../lib/datetime'

const ROLE_LABEL = { staff: 'Staff', admin: 'Admin', super_admin: 'Super admin' } as const

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

function changeTitle(request: ProfileEditRequest): string {
  const fields = Object.keys(request.new_value)
  if (fields.length > 1) return 'Name and email change'
  return fields[0] === 'email' ? 'Email change' : 'Name change'
}

function changeSummary(request: ProfileEditRequest, tz: string): string {
  const diffs = (['name', 'email'] as const)
    .filter((f) => request.new_value[f] !== undefined)
    .map((f) => `${request.old_value[f] ?? '—'} → ${request.new_value[f]}`)
  const when =
    request.status === 'pending' || !request.resolved_at
      ? `sent ${formatDateTime(request.created_at, tz)}`
      : `${request.status} ${formatDateTime(request.resolved_at, tz)}`
  return `${diffs.join(', ')} · ${when}`
}

export function Profile() {
  const { me } = useMe()
  const tz = me.org_timezone
  const isDemo = me.org_plan === 'demo'
  const [requests, setRequests] = useState<ProfileEditRequest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(me.name)
  const [email, setEmail] = useState(me.email)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sendingLink, setSendingLink] = useState(false)
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRequests(await api.profileEdits())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Admins get the whole org's requests from the same endpoint (that's what
  // the Team page's review queue needs) — this page only shows your own.
  const mine = requests.filter((r) => r.user_id === me.id)
  const pending = mine.find((r) => r.status === 'pending')
  const awaiting = mine.find((r) => r.awaiting_email_confirmation)
  // The server allows one pending request per person, and none in the demo.
  const readOnly = isDemo || !!pending
  const unchanged = name.trim() === me.name && email.trim().toLowerCase() === me.email

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      // Send both; the server records only the fields that actually changed.
      await api.requestProfileEdit({ name, email }, reason)
      setReason('')
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to send the request')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendLink(request: ProfileEditRequest) {
    setLinkError(null)
    setSendingLink(true)
    try {
      await api.sendEmailConfirmation(request.id)
      setLinkSentTo(request.new_value.email ?? null)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to send the confirmation email')
    } finally {
      setSendingLink(false)
    }
  }

  const field = `rounded-[10px] border px-3.5 outline-none focus:border-text ${
    readOnly ? 'border-dashed border-border-strong bg-transparent text-text-muted' : 'border-border bg-bg text-text'
  }`

  return (
    <Page title="My profile" sub={me.email} maxWidth={940} demo={isDemo}>
      {!loaded ? (
        <Skeleton />
      ) : error ? (
        <LoadError message={error} onRetry={load} />
      ) : (
        <div className="flex flex-col gap-[18px]">
          {awaiting && !linkSentTo && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-status-warning-bg p-4">
              <span className="flex flex-[1_1_280px] items-start gap-2.5 text-sm leading-normal">
                <span className="mt-[3px]">
                  <StatusIcon status="awaiting" size={16} />
                </span>
                <span>
                  Your new email <strong className="font-semibold [overflow-wrap:anywhere]">{awaiting.new_value.email}</strong> is approved.
                  Confirm it from that inbox to finish the change.
                  {linkError && <span className="mt-1 block text-error">{linkError}</span>}
                </span>
              </span>
              <button
                type="button"
                onClick={() => handleSendLink(awaiting)}
                disabled={sendingLink}
                className="h-[46px] flex-[1_1_100%] rounded-[10px] bg-action px-[18px] font-semibold text-on-action disabled:opacity-60 sm:flex-none"
              >
                {sendingLink ? 'Sending…' : 'Send confirmation link'}
              </button>
            </div>
          )}
          {linkSentTo && (
            <div role="status" className="flex items-start gap-2.5 rounded-[14px] bg-status-good-bg p-4 text-sm leading-normal">
              <span className="mt-[3px]">
                <StatusIcon status="approved" size={16} />
              </span>
              <span>
                Link sent to <strong className="font-semibold [overflow-wrap:anywhere]">{linkSentTo}</strong>. Open it on any device to confirm.
                Supabase may also ask you to confirm from your current address.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-start gap-4">
            <section aria-labelledby="details-heading" className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
              <h2 id="details-heading" className="m-0 text-lg font-semibold">
                Details
              </h2>
              <div className="flex items-center gap-3">
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-action text-[17px] font-semibold text-on-action">
                  {initials(me.name)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[17px] font-semibold">{me.name}</span>
                  <span className="mt-1 inline-flex h-6 items-center self-start rounded-full border border-border-strong px-2.5 text-xs">
                    {ROLE_LABEL[me.role]}
                  </span>
                </span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
                <span className="text-xs text-text-muted">Email</span>
                <span className="font-mono text-[13px] [overflow-wrap:anywhere]">{me.email}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded-[10px] bg-bg px-3 py-2.5">
                <span className="text-xs text-text-muted">Organization</span>
                <span className="text-sm">{me.org_name}</span>
              </div>
            </section>

            <section aria-labelledby="change-heading" className="flex min-w-0 flex-[1.3_1_320px] flex-col gap-3.5 rounded-[16px] bg-surface p-5 sm:px-7 sm:py-6">
              <div className="flex flex-col gap-1">
                <h2 id="change-heading" className="m-0 text-lg font-semibold">
                  Request a change
                </h2>
                <span className="text-[13px] text-text-muted">
                  {pending && !isDemo
                    ? 'A change is waiting for an admin to review. You can send another once it’s resolved.'
                    : 'An admin approves name and email changes.'}
                </span>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-text-muted">Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} maxLength={100} required className={`${field} h-[46px]`} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-text-muted">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={readOnly}
                    required
                    className={`${field} h-[46px] font-mono text-[13px]`}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-text-muted">Reason</span>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={readOnly}
                    placeholder="Why the change?"
                    required
                    className={`${field} resize-y py-2.5`}
                  />
                </label>
                {formError && (
                  <p role="alert" className="m-0 text-[13px] text-error">
                    {formError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={readOnly || submitting || unchanged}
                  className={`h-12 self-stretch rounded-[10px] px-[22px] font-semibold sm:self-start ${
                    readOnly ? 'cursor-not-allowed bg-surface-raised text-text-muted' : 'bg-action text-on-action disabled:opacity-50'
                  }`}
                >
                  {submitting ? 'Sending…' : 'Send request'}
                </button>
              </form>
            </section>
          </div>

          <section aria-labelledby="history-heading" className="flex flex-col gap-2.5">
            <h2 id="history-heading" className="m-0 text-base font-semibold">
              Your change history
            </h2>
            <div className="rounded-[16px] bg-surface">
              {mine.length === 0 && (
                <div className="px-4 py-5 text-sm text-text-muted sm:px-5">
                  No change requests yet. Anything you send above shows here with its status.
                </div>
              )}
              {mine.map((request) => (
                <div
                  key={request.id}
                  className="grid min-h-[54px] grid-cols-1 items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 text-sm last:border-b-0 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:px-5"
                >
                  <span className="font-semibold">{changeTitle(request)}</span>
                  <span className="text-text-muted [overflow-wrap:anywhere]">{changeSummary(request, tz)}</span>
                  <span className="justify-self-start">
                    <StatusDot status={request.awaiting_email_confirmation ? 'awaiting' : request.status} />
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </Page>
  )
}
