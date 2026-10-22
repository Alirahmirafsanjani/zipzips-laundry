import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Button'
import type { Role } from '@/types'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Spinner className="size-8 text-brand-700" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ dari: location.pathname }} replace />
  }

  return <>{children}</>
}

export function RequireRole({
  roles,
  children,
}: {
  roles: Role[]
  children: ReactNode
}) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-medium text-amber-900">Akses ditolak</p>
        <p className="mt-1 text-sm text-amber-700">
          Halaman ini hanya bisa dibuka oleh peran yang berwenang.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

export default RequireAuth
