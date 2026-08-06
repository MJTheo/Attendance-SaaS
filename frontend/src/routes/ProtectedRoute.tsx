import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth-context'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-text-muted">Loading…</div>
  }

  if (!session) {
    return <Navigate to="/signin" replace />
  }

  return <Outlet />
}
