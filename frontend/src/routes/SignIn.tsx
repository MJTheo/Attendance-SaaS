import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD } from '../lib/demo'
import { AuthHeading, AuthLayout, ErrorText, FormField, SecondaryButton, SubmitButton, TextLink } from './AuthLayout'

export function SignIn() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wrongPassword, setWrongPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)

  async function signIn(signInEmail: string, signInPassword: string) {
    setError(null)
    setWrongPassword(false)
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
      const message = err instanceof Error ? err.message : 'Sign in failed'
      if (/invalid login credentials/i.test(message)) {
        setWrongPassword(true)
        setError("That email and password don't match.")
      } else {
        setError(message)
      }
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
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-[22px]">
        <AuthHeading title="Sign in" sub="Welcome back." />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col gap-3.5">
          <FormField label="Email" type="email" mono autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <FormField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={wrongPassword}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <SubmitButton disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</SubmitButton>
      </form>
      <div className="flex items-center gap-3 text-[13px] text-text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <SecondaryButton onClick={handleDemo} disabled={demoSubmitting} className="h-[52px] text-base">
        {demoSubmitting ? 'Opening the demo…' : 'View live demo'}
      </SecondaryButton>
      <p className="m-0 text-sm text-text-muted">
        New here? <TextLink onClick={() => navigate('/signup')}>Create an organization</TextLink>
      </p>
    </AuthLayout>
  )
}
