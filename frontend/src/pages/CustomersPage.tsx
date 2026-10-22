import { useCallback, useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatTanggal } from '@/lib/format'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Customer } from '@/types'

export function CustomersPage() {
  const toast = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [open, setOpen] = useState(false)
  const [nama, setNama] = useState('')
  const [noHp, setNoHp] = useState('')
  const [alamat, setAlamat] = useState('')
  const [menyimpan, setMenyimpan] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      params.set('limit', '100')
      const data = await api.get<Customer[]>(`/api/customers?${params.toString()}`)
      setCustomers(data)
    } catch {
      setCustomers([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      void muat()
    }, 250)
    return () => clearTimeout(timer)
  }, [muat])

  const simpan = async () => {
    if (nama.trim().length < 2) {
      toast.error('Nama pelanggan minimal 2 karakter.')
      return
    }
    setMenyimpan(true)
    try {
      await api.post<Customer>('/api/customers', {
        nama: nama.trim(),
        noHp: noHp.trim() || null,
        alamat: alamat.trim() || null,
      })
      setOpen(false)
      setNama('')
      setNoHp('')
      setAlamat('')
      await muat()
      toast.success('Pelanggan berhasil ditambahkan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menambah pelanggan.')
    } finally {
      setMenyimpan(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Pelanggan"
        subtitle="Daftar pelanggan yang pernah/laundry di toko."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Tambah Pelanggan
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama, kode, atau no. HP…"
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-6 text-brand-700" />
            </div>
          ) : customers.length === 0 ? (
            <EmptyState
              title="Belum ada pelanggan"
              description="Tambahkan pelanggan agar pesanan berikutnya lebih cepat."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <th className="px-4 py-2.5 font-medium sm:px-5">Kode</th>
                    <th className="px-4 py-2.5 font-medium">Nama</th>
                    <th className="px-4 py-2.5 font-medium">No. HP</th>
                    <th className="px-4 py-2.5 font-medium">Alamat</th>
                    <th className="px-4 py-2.5 text-right font-medium sm:px-5">Terdaftar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-600 sm:px-5">
                        {customer.kode}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {customer.nama}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {customer.noHp ?? '-'}
                      </td>
                      <td className="max-w-48 truncate px-4 py-3 text-slate-600">
                        {customer.alamat ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 sm:px-5">
                        {formatTanggal(customer.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tambah Pelanggan"
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
          <Field label="Nama" required>
            {({ id }) => (
              <Input
                id={id}
                value={nama}
                onChange={(event) => setNama(event.target.value)}
                autoFocus
              />
            )}
          </Field>
          <Field label="No. HP">
            {({ id }) => (
              <Input
                id={id}
                value={noHp}
                onChange={(event) => setNoHp(event.target.value)}
                inputMode="tel"
                placeholder="08xx"
              />
            )}
          </Field>
          <Field label="Alamat">
            {({ id }) => (
              <Input
                id={id}
                value={alamat}
                onChange={(event) => setAlamat(event.target.value)}
              />
            )}
          </Field>
        </div>
      </Modal>
    </>
  )
}

export default CustomersPage
