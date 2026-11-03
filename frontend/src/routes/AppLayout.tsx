import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { api, ApiError, type Me, type Notifications } from '../lib/api'
import { MeProvider, type MeContextValue } from '../lib/me-context'
import { Sidebar } from '../components/Sidebar'
import { LoadError } from '../components/Skeleton'
import { Onboarding } from './Onboarding'

// The signed-in app's shell. Loads the profile (+ org) and the inbox counts
// once, then keeps the sidebar mounted while pages change underneath it —
// pages show their own in-place skeletons instead of blanking the screen.
export function AppLayout() {
  const [me, setMe] = useState<Me | null>(null)
  const [notifications, setNotifications] = useState<Notifications | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshMe = useCallback(async () => {
    setMe(await api.me())
  }, [])

  const refreshNotifications = useCallback(async () => {
    try {
      setNotifications(await api.notifications())
    } catch {
      // Counts are a convenience; the pages still work without them.
    }
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      setMe(await api.me())
      setNeedsOnboarding(false)
      refreshNotifications()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNeedsOnboarding(true)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load')
      }
    }
  }, [refreshNotifications])

  useEffect(() => {
    load()
  }, [load])

  const value = useMemo<MeContextValue | null>(
    () => (me ? { me, notifications, refreshMe, refreshNotifications } : null),
    [me, notifications, refreshMe, refreshNotifications],
  )

  if (needsOnboarding) {
    return <Onboarding onDone={() => load()} />
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <LoadError message={error} onRetry={load} />
      </div>
    )
  }

  if (!value) {
    // First load only: there's no profile yet to draw the sidebar with.
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  return (
    <MeProvider value={value}>
      <div className="min-h-screen sm:flex">
        <Sidebar me={value.me} notifications={notifications} />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </MeProvider>
  )
}
