import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Package, LogIn } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { api, ApiError } from '@/lib/api'

export function LoginPage() {
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [namaToko, setNamaToko] = useState('ZIP-ZIPS LAUNDRI')

  useEffect(() => {
    api
      .get<{ namaToko: string }>('/api/settings/publik')
      .then((data) => {
        if (data?.namaToko) setNamaToko(data.namaToko)
      })
      .catch(() => {
        /* biarkan nama bawaan */
      })
  }, [])

  useEffect(() => {
    if (!loading && user) {
      const asal = (location.state as { dari?: string } | null)?.dari
      navigate(asal && asal !== '/login' ? asal : '/', { replace: true })
    }
  }, [user, loading, navigate, location.state])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Gagal masuk. Silakan coba lagi.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 via-brand-900 to-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Package className="size-7 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-white">{namaToko}</h1>
          <p className="mt-1 text-sm text-brand-200">Sistem Informasi Laundry</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-xl"
        >
          <Field label="Username" required>
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoFocus
                required
                placeholder="owner"
              />
            )}
          </Field>

          <Field label="Kata sandi" required>
            {({ id, invalid }) => (
              <Input
                id={id}
                invalid={invalid}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••"
              />
            )}
          </Field>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            loading={submitting}
            className="w-full"
          >
            <LogIn className="size-4" />
            Masuk
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-brand-200/80">
          ZIP-ZIPS LAUNDRI — Bantul, Yogyakarta
        </p>
      </div>
    </div>
  )
}

export default LoginPage
