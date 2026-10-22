import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatTanggal } from '@/lib/format'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Role, User } from '@/types'

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'OWNER', label: 'Pemilik — akses penuh' },
  { value: 'KASIR', label: 'Kasir — POS, pembayaran, pelanggan' },
  { value: 'OPERATOR', label: 'Karangian — status pengerjaan saja' },
]

export function UsersPage() {
  const toast = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [nama, setNama] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('KASIR')
  const [noHp, setNoHp] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      setUsers(await api.get<User[]>('/api/users'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal memuat pengguna.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void muat()
  }, [muat])

  const simpan = async () => {
    if (nama.trim().length < 2) {
      toast.error('Nama wajib diisi.')
      return
    }
    if (username.trim().length < 3) {
      toast.error('Username minimal 3 karakter.')
      return
    }
    if (password.length < 6) {
      toast.error('Kata sandi minimal 6 karakter.')
      return
    }
    setMenyimpan(true)
    try {
      await api.post<User>('/api/users', {
        nama: nama.trim(),
        username: username.trim().toLowerCase(),
        password,
        role,
        noHp: noHp.trim() || null,
      })
      setOpen(false)
      setNama('')
      setUsername('')
      setPassword('')
      setNoHp('')
      await muat()
      toast.success('Pengguna berhasil ditambahkan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menambah pengguna.')
    } finally {
      setMenyimpan(false)
    }
  }

  const ubahAktif = async (user: User) => {
    try {
      await api.patch<User>(`/api/users/${user.id}`, { aktif: !user.aktif })
      await muat()
      toast.success(user.aktif ? 'Pengguna dinonaktifkan.' : 'Pengguna diaktifkan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mengubah status.')
    }
  }

  return (
    <>
      <PageHeader
        title="Pengguna"
        subtitle="Kelola akun kasir dan karangian."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Tambah Pengguna
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-6 text-brand-700" />
            </div>
          ) : users.length === 0 ? (
            <EmptyState title="Belum ada pengguna" />
          ) : (
            <div className="divide-y divide-slate-100">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {user.nama}{' '}
                      {!user.aktif && (
                        <Badge tone="red" className="ml-1">
                          Nonaktif
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      @{user.username}
                      {user.noHp ? ` · ${user.noHp}` : ''} · dibuat{' '}
                      {formatTanggal(user.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={user.role === 'OWNER' ? 'brand' : 'slate'}>
                      {ROLE_OPTIONS.find((r) => r.value === user.role)?.label.split(
                        ' — ',
                      )[0] ?? user.role}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void ubahAktif(user)}
                    >
                      {user.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah Pengguna"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={simpan} loading={menyimpan}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nama lengkap" required>
            {({ id }) => (
              <Input
                id={id}
                value={nama}
                onChange={(event) => setNama(event.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label="Username" required hint="Huruf kecil, angka, titik, garis, strip.">
            {({ id }) => (
              <Input
                id={id}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Kata sandi" required hint="Minimal 6 karakter.">
            {({ id }) => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field label="Peran" required>
            {({ id }) => (
              <Select
                id={id}
                value={role}
                onChange={(event) => setRole(event.target.value as Role)}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="No. HP">
            {({ id }) => (
              <Input
                id={id}
                value={noHp}
                onChange={(event) => setNoHp(event.target.value)}
                inputMode="tel"
              />
            )}
          </Field>
        </div>
      </Modal>
    </>
  )
}

export default UsersPage
