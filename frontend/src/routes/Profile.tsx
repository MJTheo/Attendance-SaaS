import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type ProfileEditRequest, type UserProfile } from '../lib/api'
import { DEMO_ADMIN_EMAIL } from '../lib/demo'
import { Skeleton } from '../components/Skeleton'
import { useMe } from '../lib/me-context'
import { ProfileEditsList } from '../components/ProfileEditsList'

const LABEL_CLASS = 'mb-1 block font-mono text-xs uppercase tracking-wide text-text-muted'
const SECTION_CLASS = 'mb-8 rounded-lg border border-border bg-surface p-4 sm:p-6'
const SECTION_HEADING_CLASS = 'mb-3 font-sans text-sm font-semibold uppercase tracking-wide text-text-muted'
const INPUT_CLASS =
  'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-status-good disabled:opacity-50'

const ROLE_LABEL: Record<UserProfile['role'], string> = {
  staff: 'Staff',
  admin: 'Admin',
  super_admin: 'Super admin',
}

export function Profile() {
  const { me: profile } = useMe()
  const [loaded, setLoaded] = useState(false)
  const [requests, setRequests] = useState<ProfileEditRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sendingConfirmation, setSendingConfirmation] = useState(false)
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setName(profile.name)
      setEmail(profile.email)
      setRequests(await api.profileEdits())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [profile])

  useEffect(() => {
    load()
  }, [load])

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
      setFormError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendConfirmation(request: ProfileEditRequest) {
    setConfirmationMessage(null)
    setError(null)
    setSendingConfirmation(true)
    try {
      await api.sendEmailConfirmation(request.id)
      setConfirmationMessage(
        `Confirmation link sent to ${request.new_value.email}. Your login switches once you click it ` +
          `(Supabase may also ask you to confirm from your current address).`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send confirmation email')
    } finally {
      setSendingConfirmation(false)
    }
  }

  // Admins get the whole org's requests from the same endpoint (that's what
  // the Team page's review queue needs) — this page only shows your own.
  const mine = requests.filter((r) => r.user_id === profile.id)
  const pending = mine.find((r) => r.status === 'pending')
  const awaitingConfirmation = mine.find((r) => r.awaiting_email_confirmation)
  const isDemo = profile.email === DEMO_ADMIN_EMAIL

  if (!loaded) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Skeleton />
      </main>
    )
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 font-sans text-lg font-semibold text-text">My profile</h1>

        {error && <p className="mb-4 font-mono text-sm text-status-warning">{error}</p>}

        <section className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>Details</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className={LABEL_CLASS}>Name</dt>
              <dd className="font-sans text-base font-semibold text-text">{profile.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className={LABEL_CLASS}>Email</dt>
              <dd className="break-all font-mono text-sm text-text">{profile.email}</dd>
            </div>
            <div>
              <dt className={LABEL_CLASS}>Role</dt>
              <dd className="font-mono text-sm text-text">{ROLE_LABEL[profile.role]}</dd>
            </div>
          </dl>
        </section>

        {awaitingConfirmation && (
          <section className="mb-8 rounded-lg border border-status-warning/40 bg-status-warning/10 p-4 sm:p-6">
            <p className="mb-3 font-mono text-sm text-text">
              Your change to <span className="break-all">{awaitingConfirmation.new_value.email}</span> was approved.
              Your login switches once you confirm the new address.
            </p>
            {confirmationMessage ? (
              <p className="font-mono text-xs text-text-muted">{confirmationMessage}</p>
            ) : (
              <button
                type="button"
                onClick={() => handleSendConfirmation(awaitingConfirmation)}
                disabled={sendingConfirmation}
                className="rounded-md bg-status-good px-3 py-1.5 font-mono text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
              >
                {sendingConfirmation ? 'Sending…' : 'Send confirmation link'}
              </button>
            )}
          </section>
        )}

        <section className={SECTION_CLASS}>
          <h2 className={SECTION_HEADING_CLASS}>Request a change</h2>
          {loading ? (
            <p className="font-mono text-sm text-text-muted">Loading…</p>
          ) : isDemo ? (
            <p className="font-mono text-sm text-text-muted">Profile changes are disabled for the shared demo account.</p>
          ) : pending ? (
            <p className="font-mono text-sm text-text-muted">
              You have a change waiting for an admin to review. You can request another once it's resolved.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="font-mono text-xs text-text-muted">
                Changes take effect once an admin approves them. A new email also needs you to confirm it from that
                inbox.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label>
                  <span className={LABEL_CLASS}>Name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required className={INPUT_CLASS} />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Email</span>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={INPUT_CLASS} />
                </label>
              </div>
              <label>
                <span className={LABEL_CLASS}>Reason</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Updated surname after marriage"
                  required
                  className={INPUT_CLASS}
                />
              </label>
              {formError && <p className="font-mono text-xs text-status-warning">{formError}</p>}
              <div>
                <button
                  type="submit"
                  disabled={submitting || (name.trim() === profile.name && email.trim().toLowerCase() === profile.email)}
                  className="rounded-md bg-status-good px-3 py-1.5 font-mono text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit for approval'}
                </button>
              </div>
            </form>
          )}
        </section>

        <section>
          <h2 className={SECTION_HEADING_CLASS}>My change requests</h2>
          {loading ? <p className="font-mono text-sm text-text-muted">Loading…</p> : <ProfileEditsList requests={mine} />}
        </section>
      </main>
    </>
  )
}
