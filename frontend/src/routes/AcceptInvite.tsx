import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthLayout, ErrorText, FormField, SubmitButton } from './AuthLayout'

export function AcceptInvite() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Set your password">
      <form onSubmit={handleSubmit}>
        {error && <ErrorText>{error}</ErrorText>}
        <FormField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <SubmitButton disabled={submitting}>{submitting ? 'Saving…' : 'Set password & continue'}</SubmitButton>
      </form>
    </AuthLayout>
  )
}
