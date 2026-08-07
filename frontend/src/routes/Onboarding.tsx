import { useState, type FormEvent } from 'react'
import { api, type UserProfile } from '../lib/api'
import { AuthLayout, ErrorText, FormField, SubmitButton } from './AuthLayout'

export function Onboarding({ onDone }: { onDone: (profile: UserProfile) => void }) {
  const [orgName, setOrgName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const profile = await api.signup(orgName, adminName, accessCode)
      onDone(profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Finish setting up your organization">
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
          label="Access code"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code from your authenticator app"
          required
        />
        <SubmitButton disabled={submitting}>{submitting ? 'Creating…' : 'Create organization'}</SubmitButton>
      </form>
    </AuthLayout>
  )
}
