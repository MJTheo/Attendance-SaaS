import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api, ApiError } from '../lib/api'
import { AuthHeading, AuthLayout, CodeInput, ErrorText, FormField, SecondaryButton, SubmitButton, TextLink } from './AuthLayout'

export function SignUp() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [codeInvalid, setCodeInvalid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setCodeInvalid(false)
    setSubmitting(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) throw signUpError

      if (!data.session) {
        // Email confirmation is required before a session exists. The org
        // itself gets provisioned on the first authenticated visit (the app
        // shell shows Onboarding) — we have no valid token to call the
        // backend with yet.
        setPendingConfirmation(true)
        return
      }

      await api.signup(orgName, adminName, accessCode)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setCodeInvalid(true)
      } else {
        setError(err instanceof Error ? err.message : 'Sign up failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (pendingConfirmation) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-3.5 rounded-[16px] bg-surface p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-status-good-bg text-status-good">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 4h11v8h-11zM2.5 4.5L8 9l5.5-4.5" />
            </svg>
          </span>
          <h1 className="m-0 text-[26px] font-semibold tracking-[-0.02em]">Check your email</h1>
          <p className="m-0 text-text-muted">
            We sent a confirmation link to{' '}
            <strong className="font-mono text-sm font-medium text-text [overflow-wrap:anywhere]">{email}</strong>. Open it to finish
            setting up {orgName || 'your organization'}.
          </p>
          <SecondaryButton onClick={() => navigate('/signin')} className="h-11 self-start rounded-[10px] px-4">
            Back to sign in
          </SecondaryButton>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AuthHeading title="Create your organization" sub="You'll be its super admin." />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col gap-3.5">
          <FormField label="Organization name" value={orgName} onChange={(e) => setOrgName(e.target.value)} required />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3">
            <FormField label="Your name" autoComplete="name" value={adminName} onChange={(e) => setAdminName(e.target.value)} required />
            <FormField label="Email" type="email" mono autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <FormField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </div>
        <CodeInput
          label="Access code"
          value={accessCode}
          onChange={setAccessCode}
          invalid={codeInvalid}
          help="The 6-digit code from your authenticator app."
        />
        <div className="flex flex-col gap-3.5">
          <SubmitButton disabled={submitting || accessCode.length !== 6}>{submitting ? 'Creating…' : 'Create organization'}</SubmitButton>
          <p className="m-0 text-sm text-text-muted">
            Already have an account? <TextLink onClick={() => navigate('/signin')}>Sign in</TextLink>
          </p>
        </div>
      </form>
    </AuthLayout>
  )
}
