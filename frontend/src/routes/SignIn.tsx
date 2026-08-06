import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from '../lib/demo'
import { AuthLayout, ErrorText, FormField, SubmitButton } from './AuthLayout'

export function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)

  async function signIn(signInEmail: string, signInPassword: string) {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: signInEmail,
      password: signInPassword,
    })
    if (signInError) throw signInError
    navigate('/', { replace: true })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDemo() {
    setDemoSubmitting(true)
    try {
      await signIn(DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign in failed')
    } finally {
      setDemoSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={handleSubmit}>
        {error && <ErrorText>{error}</ErrorText>}
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
          required
        />
        <SubmitButton disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="font-mono text-xs text-text-muted">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={handleDemo}
        disabled={demoSubmitting}
        className="w-full rounded-md border border-border px-3 py-2 font-mono text-sm text-text transition-opacity hover:border-status-good hover:text-status-good disabled:opacity-50"
      >
        {demoSubmitting ? 'Loading demo…' : 'View live demo'}
      </button>
    </AuthLayout>
  )
}
