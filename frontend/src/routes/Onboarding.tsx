import { useState, type FormEvent } from 'react'
import { api, ApiError, type UserProfile } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { supabase } from '../lib/supabase'
import { AuthHeading, AuthLayout, CodeInput, ErrorText, FormField, SubmitButton } from './AuthLayout'

export function Onboarding({ onDone }: { onDone: (profile: UserProfile) => void }) {
  const { session } = useAuth()
  const [orgName, setOrgName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [codeInvalid, setCodeInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setCodeInvalid(false)
    setSubmitting(true)
    try {
      const profile = await api.signup(orgName, adminName, accessCode)
      onDone(profile)
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setCodeInvalid(true)
      } else {
        setError(err instanceof Error ? err.message : 'Setup failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AuthHeading
          title="Finish setting up your organization"
          sub={
            <>
              You're signed in as <span className="font-mono text-sm text-text">{session?.user.email ?? 'your account'}</span> but aren't in
              an organization yet.
            </>
          }
        />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col gap-3.5">
          <FormField label="Organization name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
          <FormField label="Your name" autoComplete="name" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
        </div>
        <CodeInput
          label="Fresh access code"
          value={accessCode}
          onChange={setAccessCode}
          invalid={codeInvalid}
          help="The 6-digit code from your authenticator app."
        />
        <div className="flex flex-col gap-3.5">
          <SubmitButton disabled={submitting || accessCode.length !== 6}>{submitting ? 'Creating…' : 'Create organization'}</SubmitButton>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="self-start px-0.5 py-2.5 text-sm text-text-muted underline"
          >
            Sign out
          </button>
        </div>
      </form>
    </AuthLayout>
  )
}
