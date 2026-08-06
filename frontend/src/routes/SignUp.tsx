import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { AuthLayout, ErrorText, FormField, SubmitButton } from './AuthLayout'

export function SignUp() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) throw signUpError

      if (!data.session) {
        // Email confirmation is required before a session exists. The org
        // itself gets provisioned on first authenticated visit to "/" (see
        // Dashboard), not here — we have no valid token to call the backend
        // with yet.
        setPendingConfirmation(true)
        return
      }

      await api.signup(orgName, adminName, accessCode)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (pendingConfirmation) {
    return (
      <AuthLayout title="Check your email">
        <p className="font-mono text-sm text-text-muted">
          Confirm your address, then{' '}
          <Link to="/signin" className="text-status-good">
            sign in
          </Link>{' '}
          — you'll finish setting up your organization on your first visit.
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your organization">
      <form onSubmit={handleSubmit}>
        {error && <ErrorText>{error}</ErrorText>}
        <FormField
          label="Organization name"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          required
        />
        <FormField
          label="Your name"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          required
        />
        <FormField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <FormField
          label="Access code"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          required
        />
        <SubmitButton disabled={submitting}>{submitting ? 'Creating…' : 'Create organization'}</SubmitButton>
      </form>
      <p className="mt-4 font-mono text-xs text-text-muted">
        Already have an account?{' '}
        <Link to="/signin" className="text-status-good">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
