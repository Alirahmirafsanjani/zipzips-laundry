import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Setting } from '@/types'

const FIELDS: Array<{
  key: string
  label: string
  type: 'text' | 'textarea'
  hint?: string
}> = [
  { key: 'namaToko', label: 'Nama toko', type: 'text' },
  { key: 'alamat', label: 'Alamat', type: 'text' },
  { key: 'noWhatsapp', label: 'Nomor WhatsApp', type: 'text', hint: 'Untuk pesan konfirmasi ke pelanggan.' },
  {
    key: 'catatanStruk',
    label: 'Catatan di struk',
    type: 'textarea',
    hint: 'Dicetak pada bagian bawah struk.',
  },
]

export function SettingsPage() {
  const toast = useToast()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [menyimpan, setMenyimpan] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Setting>('/api/settings')
      const next: Record<string, string> = {}
      for (const field of FIELDS) {
        next[field.key] = String(data[field.key] ?? '')
      }
      setValues(next)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal memuat pengaturan.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void muat()
  }, [muat])

  const simpan = async () => {
    setMenyimpan(true)
    try {
      for (const field of FIELDS) {
        await api.put(`/api/settings/${field.key}`, { value: values[field.key] ?? '' })
      }
      toast.success('Pengaturan tersimpan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyimpan pengaturan.')
    } finally {
      setMenyimpan(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-7 text-brand-700" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Pengaturan"
        subtitle="Identitas toko yang dipakai pada struk dan halaman login."
        action={
          <Button onClick={simpan} loading={menyimpan}>
            <Save className="size-4" />
            Simpan
          </Button>
        }
      />

      <Card className="max-w-2xl">
        <CardHeader title="Identitas Toko" />
        <CardBody className="space-y-4">
          {FIELDS.map((field) => (
            <Field key={field.key} label={field.label} hint={field.hint}>
              {({ id }) =>
                field.type === 'textarea' ? (
                  <Textarea
                    id={id}
                    value={values[field.key] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  <Input
                    id={id}
                    value={values[field.key] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                  />
                )
              }
            </Field>
          ))}
        </CardBody>
      </Card>

      <Card className="mt-4 max-w-2xl">
        <CardHeader title="Tentang Sistem" />
        <CardBody className="space-y-2 text-sm text-slate-600">
          <p>
            <strong className="text-slate-800">ZIP-ZIPS LAUNDRI</strong> — Sistem
            Informasi Laundry untuk outlet Bantul, Yogyakarta.
          </p>
          <p>
            Versi 0.1.0 · Modular monolit (Express + Prisma + PostgreSQL) ·
            Frontend React + Vite.
          </p>
          <p className="text-xs text-slate-500">
            Pengaturan teknis (database, hosting, backup) diatur lewat variabel
            lingkungan, bukan dari halaman ini.
          </p>
        </CardBody>
      </Card>
    </>
  )
}

export default SettingsPage
