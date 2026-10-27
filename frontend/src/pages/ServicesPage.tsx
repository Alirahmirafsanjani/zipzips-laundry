import { useCallback, useEffect, useState } from 'react'
import { Archive, Edit, Plus, RotateCcw } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatRupiah } from '@/lib/format'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { Service } from '@/types'

const SATUAN_OPTIONS = [
  { value: 'KG', label: 'Kiloan (KG)' },
  { value: 'ITEM', label: 'Satuan (ITEM)' },
]

const INITIAL_FORM = {
  kode: '',
  nama: '',
  satuan: 'KG' as 'KG' | 'ITEM',
  hargaDefault: '',
  estimasiHari: '2',
  deskripsi: '',
}

export function ServicesPage() {
  const toast = useToast()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(INITIAL_FORM)
  const [menyimpan, setMenyimpan] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get<Service[]>('/api/services?includeInactive=true')
      setServices(data)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal memuat daftar layanan.')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void muat()
  }, [muat])

  const bukaTambah = () => {
    setEditingId(null)
    setForm(INITIAL_FORM)
    setOpen(true)
  }

  const bukaEdit = (service: Service) => {
    setEditingId(service.id)
    setForm({
      kode: service.kode,
      nama: service.nama,
      satuan: service.satuan,
      hargaDefault: String(service.hargaDefault),
      estimasiHari: String(service.estimasiHari ?? 1),
      deskripsi: service.deskripsi ?? '',
    })
    setOpen(true)
  }

  const simpan = async () => {
    if (form.kode.trim().length < 2) {
      toast.error('Kode layanan minimal 2 karakter.')
      return
    }
    if (form.nama.trim().length < 2) {
      toast.error('Nama layanan minimal 2 karakter.')
      return
    }
    const harga = Number(form.hargaDefault)
    if (!Number.isInteger(harga) || harga < 0) {
      toast.error('Harga default harus berupa angka bulat tidak negatif.')
      return
    }
    const estimasi = Number(form.estimasiHari)
    if (!Number.isInteger(estimasi) || estimasi < 0 || estimasi > 60) {
      toast.error('Estimasi hari harus antara 0 - 60.')
      return
    }

    setMenyimpan(true)
    try {
      if (editingId) {
        await api.patch<Service>(`/api/services/${editingId}`, {
          kode: form.kode.trim().toUpperCase(),
          nama: form.nama.trim(),
          satuan: form.satuan,
          hargaDefault: harga,
          estimasiHari: estimasi,
          deskripsi: form.deskripsi.trim() || null,
        })
        toast.success('Layanan berhasil diperbarui.')
      } else {
        await api.post<Service>('/api/services', {
          kode: form.kode.trim().toUpperCase(),
          nama: form.nama.trim(),
          satuan: form.satuan,
          hargaDefault: harga,
          estimasiHari: estimasi,
          deskripsi: form.deskripsi.trim() || null,
        })
        toast.success('Layanan berhasil ditambahkan.')
      }
      setOpen(false)
      await muat()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyimpan layanan.')
    } finally {
      setMenyimpan(false)
    }
  }

  const arsipkan = async (service: Service) => {
    if (!confirm(`Arsipkan layanan "${service.nama}"? Layanan yang diarsipkan tidak muncul di POS.`)) {
      return
    }
    try {
      await api.post<Service>(`/api/services/${service.id}/arsipkan`)
      await muat()
      toast.success('Layanan berhasil diarsipkan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mengarsipkan layanan.')
    }
  }

  const aktifkanKembali = async (service: Service) => {
    try {
      await api.patch<Service>(`/api/services/${service.id}`, { isAktif: true })
      await muat()
      toast.success('Layanan diaktifkan kembali.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mengaktifkan layanan.')
    }
  }

  return (
    <>
      <PageHeader
        title="Menu Layanan"
        subtitle="Kelola layanan laundry, harga, satuan, dan estimasi pengerjaan."
        action={
          <Button onClick={bukaTambah}>
            <Plus className="size-4" />
            Tambah Layanan
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-6 text-brand-700" />
            </div>
          ) : services.length === 0 ? (
            <EmptyState title="Belum ada layanan" description="Tambahkan layanan pertama untuk digunakan di POS." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left">
                    <th className="px-4 py-2.5 font-medium text-slate-600 sm:px-5">Kode</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600 sm:px-5">Nama Layanan</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600 sm:px-5">Satuan</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600 sm:px-5">Harga Default</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600 sm:px-5">Estimasi</th>
                    <th className="px-4 py-2.5 font-medium text-slate-600 sm:px-5">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium text-slate-600 sm:px-5">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {services.map((service) => (
                    <tr key={service.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 sm:px-5">{service.kode}</td>
                      <td className="px-4 py-3 sm:px-5">
                        <p className="font-medium text-slate-800">{service.nama}</p>
                        {service.deskripsi ? <p className="mt-0.5 text-xs text-slate-500">{service.deskripsi}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-slate-600 sm:px-5">{service.satuan === 'KG' ? 'Kiloan' : 'Satuan'}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 sm:px-5">{formatRupiah(service.hargaDefault)}</td>
                      <td className="px-4 py-3 text-slate-600 sm:px-5">{service.estimasiHari} hari</td>
                      <td className="px-4 py-3 sm:px-5">
                        <Badge tone={service.isAktif ? 'green' : 'slate'}>
                          {service.isAktif ? 'Aktif' : 'Diarsipkan'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => bukaEdit(service)}>
                            <Edit className="size-3.5" />
                            Ubah
                          </Button>
                          {service.isAktif ? (
                            <Button size="sm" variant="outline" onClick={() => void arsipkan(service)}>
                              <Archive className="size-3.5" />
                              Arsipkan
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => void aktifkanKembali(service)}>
                              <RotateCcw className="size-3.5" />
                              Aktifkan
                            </Button>
                          )}
                        </div>
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
        title={editingId ? 'Ubah Layanan' : 'Tambah Layanan'}
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kode" required hint="Huruf kapital, angka, strip.">
              {({ id }) => (
                <Input
                  id={id}
                  value={form.kode}
                  onChange={(event) => setForm((c) => ({ ...c, kode: event.target.value.toUpperCase() }))}
                  autoFocus
                />
              )}
            </Field>
            <Field label="Satuan" required>
              {({ id }) => (
                <Select id={id} value={form.satuan} onChange={(event) => setForm((c) => ({ ...c, satuan: event.target.value as 'KG' | 'ITEM' }))}>
                  {SATUAN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label="Nama Layanan" required>
            {({ id }) => <Input id={id} value={form.nama} onChange={(event) => setForm((c) => ({ ...c, nama: event.target.value }))} />}
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Harga Default (Rp)" required hint="Harga master untuk POS. Kasir bisa menurunkan, tidak boleh menaikkan.">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={form.hargaDefault}
                  onChange={(event) => setForm((c) => ({ ...c, hargaDefault: event.target.value }))}
                />
              )}
            </Field>
            <Field label="Estimasi Selesai (hari)" required>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={60}
                  step={1}
                  inputMode="numeric"
                  value={form.estimasiHari}
                  onChange={(event) => setForm((c) => ({ ...c, estimasiHari: event.target.value }))}
                />
              )}
            </Field>
          </div>
          <Field label="Deskripsi">
            {({ id }) => <Textarea id={id} rows={3} value={form.deskripsi} onChange={(event) => setForm((c) => ({ ...c, deskripsi: event.target.value }))} />}
          </Field>
        </div>
      </Modal>
    </>
  )
}

export default ServicesPage
