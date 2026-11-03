import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api, type Me } from '../lib/api'
import { AuthHeading, AuthLayout, ErrorText, FormField, SubmitButton } from './AuthLayout'

const MIN_PASSWORD_LENGTH = 6

export function AcceptInvite() {
  const navigate = useNavigate()
  const [me, setMe] = useState<Me | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // The invite already created this person's profile, so the org and the
    // invited address can be shown; without them the heading still works.
    api.me().then(setMe).catch(() => setMe(null))
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError("Those passwords don't match.")
      return
    }
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      navigate('/', { replace: true })
    } catch {
      setError("Couldn't save your password. Try again, or ask your admin for a fresh invite.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <AuthHeading
          title="Set your password"
          sub={
            me ? (
              <>
                You've been invited to <strong className="font-semibold text-text">{me.org_name}</strong> as{' '}
                <span className="font-mono text-sm text-text">{me.email}</span>.
              </>
            ) : (
              "You've been invited to Landas Time."
            )
          }
        />
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col gap-3.5">
          <FormField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            required
          />
          <FormField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
        </div>
        <SubmitButton disabled={submitting}>{submitting ? 'Saving…' : 'Set password and continue'}</SubmitButton>
      </form>
    </AuthLayout>
  )
}
