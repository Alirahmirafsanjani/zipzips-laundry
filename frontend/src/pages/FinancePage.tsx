import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import {
  daysAgoIso,
  formatRupiah,
  formatTanggal,
  startOfMonthIso,
  todayIso,
} from '@/lib/format'
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type {
  Expense,
  FinanceSummary,
  KategoriPengeluaran,
  MetodeBayar,
} from '@/types'

const KATEGORI_PENGELUARAN: Array<{ value: KategoriPengeluaran; label: string }> = [
  { value: 'BAHAN_BAKU', label: 'Bahan Baku' },
  { value: 'GAJI', label: 'Gaji' },
  { value: 'LISTRIK_GAS', label: 'Listrik & Gas' },
  { value: 'SEWA', label: 'Sewa Tempat' },
  { value: 'TRANSPORTASI', label: 'Transportasi' },
  { value: 'PERAWATAN', label: 'Perawatan Mesin' },
  { value: 'REFUND', label: 'Refund Pelanggan' },
  { value: 'LAIN_LAIN', label: 'Lain-lain' },
]

const LABEL_METODE: Record<MetodeBayar, string> = {
  TUNAI: 'Tunai',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer',
}

export function FinancePage() {
  const toast = useToast()
  const [dari, setDari] = useState(startOfMonthIso())
  const [sampai, setSampai] = useState(todayIso())
  const [ringkasan, setRingkasan] = useState<FinanceSummary | null>(null)
  const [pengeluaran, setPengeluaran] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const [open, setOpen] = useState(false)
  const [kategori, setKategori] = useState<KategoriPengeluaran>('BAHAN_BAKU')
  const [keterangan, setKeterangan] = useState('')
  const [nominal, setNominal] = useState('')
  const [metode, setMetode] = useState<MetodeBayar>('TUNAI')
  const [menyimpan, setMenyimpan] = useState(false)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ dari, sampai })
      const [data, list] = await Promise.all([
        api.get<FinanceSummary>(`/api/finance/ringkasan?${params.toString()}`),
        api.get<Expense[]>(`/api/finance/pengeluaran?${params.toString()}&limit=50`),
      ])
      setRingkasan(data)
      setPengeluaran(list)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal memuat laporan.')
    } finally {
      setLoading(false)
    }
  }, [dari, sampai, toast])

  useEffect(() => {
    void muat()
  }, [muat])

  const simpan = async () => {
    const nilai = Number(nominal.replace(/\D/g, ''))
    if (keterangan.trim().length < 2) {
      toast.error('Keterangan wajib diisi.')
      return
    }
    if (!nilai || nilai <= 0) {
      toast.error('Nominal harus lebih dari nol.')
      return
    }
    setMenyimpan(true)
    try {
      await api.post<Expense>('/api/finance/pengeluaran', {
        tanggal: todayIso(),
        kategori,
        keterangan: keterangan.trim(),
        nominal: nilai,
        metodeBayar: metode,
      })
      setOpen(false)
      setKeterangan('')
      setNominal('')
      await muat()
      toast.success('Pengeluaran tercatat.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyimpan pengeluaran.')
    } finally {
      setMenyimpan(false)
    }
  }

  const preset = [
    { label: 'Hari ini', from: todayIso(), to: todayIso() },
    { label: '7 hari', from: daysAgoIso(6), to: todayIso() },
    { label: 'Bulan ini', from: startOfMonthIso(), to: todayIso() },
  ]

  return (
    <>
      <PageHeader
        title="Keuangan"
        subtitle="Omzet, penerimaan kas, pengeluaran, dan laba kas untuk periode terpilih."
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Catat Pengeluaran
          </Button>
        }
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="Dari" className="w-40">
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={dari}
                onChange={(event) => setDari(event.target.value)}
              />
            )}
          </Field>
          <Field label="Sampai" className="w-40">
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={sampai}
                onChange={(event) => setSampai(event.target.value)}
              />
            )}
          </Field>
          <div className="flex gap-1.5">
            {preset.map((item) => (
              <Button
                key={item.label}
                size="sm"
                variant="secondary"
                onClick={() => {
                  setDari(item.from)
                  setSampai(item.to)
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </CardBody>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-7 text-brand-700" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Omzet"
              value={formatRupiah(ringkasan?.omzet ?? 0)}
              hint="Nilai pekerjaan diterima"
              tone="brand"
            />
            <StatCard
              label="Penerimaan kas"
              value={formatRupiah(ringkasan?.penerimaanKas ?? 0)}
              hint="Uang yang benar-benar masuk"
            />
            <StatCard
              label="Pengeluaran"
              value={formatRupiah(ringkasan?.pengeluaran ?? 0)}
              tone={ringkasan && ringkasan.pengeluaran > 0 ? 'amber' : 'default'}
            />
            <StatCard
              label="Laba kas"
              value={formatRupiah(ringkasan?.labaKas ?? 0)}
              hint="Belum memperhitungkan HPP"
              tone={
                ringkasan && ringkasan.labaKas < 0 ? 'red' : 'default'
              }
            />
          </div>

          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Cara membaca laporan ini</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              <li>
                <strong>Omzet</strong> dihitung dari tanggal pesanan masuk — nilai
                pekerjaan, bukan uang yang sudah diterima.
              </li>
              <li>
                <strong>Penerimaan kas</strong> dihitung dari tanggal pembayaran
                (tunai + QRIS + transfer + pemasukan lain).
              </li>
              <li>
                <strong>Laba kas</strong> = penerimaan kas − pengeluaran. Ini{' '}
                <em>bukan</em> laba bersih: biaya bahan baku per kg, listrik, dan
                karangian belum dihitung.
              </li>
              <li>
                <strong>Piutang</strong> (sisa tagihan pesanan aktif):{' '}
                {formatRupiah(ringkasan?.piutang ?? 0)}.
              </li>
            </ul>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Penerimaan per metode" />
              <CardBody className="space-y-2">
                {Object.keys(ringkasan?.perMetode ?? {}).length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">
                    Belum ada penerimaan.
                  </p>
                ) : (
                  Object.entries(ringkasan?.perMetode ?? {}).map(([metode, nilai]) => (
                    <div key={metode} className="flex justify-between text-sm">
                      <span className="text-slate-600">
                        {LABEL_METODE[metode as MetodeBayar] ?? metode}
                      </span>
                      <span className="tabular font-medium">{formatRupiah(nilai)}</span>
                    </div>
                  ))
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Pengeluaran per kategori" />
              <CardBody className="space-y-2">
                {Object.keys(ringkasan?.perKategoriPengeluaran ?? {}).length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">
                    Belum ada pengeluaran.
                  </p>
                ) : (
                  Object.entries(ringkasan?.perKategoriPengeluaran ?? {}).map(
                    ([kategori, nilai]) => (
                      <div key={kategori} className="flex justify-between text-sm">
                        <span className="text-slate-600">
                          {KATEGORI_PENGELUARAN.find((k) => k.value === kategori)
                            ?.label ?? kategori}
                        </span>
                        <span className="tabular font-medium">
                          {formatRupiah(nilai)}
                        </span>
                      </div>
                    ),
                  )
                )}
              </CardBody>
            </Card>
          </div>

          <Card className="mt-4">
            <CardHeader title="Rincian pengeluaran" />
            <CardBody className="p-0">
              {pengeluaran.length === 0 ? (
                <EmptyState title="Belum ada pengeluaran pada periode ini" />
              ) : (
                <div className="divide-y divide-slate-100">
                  {pengeluaran.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {item.keterangan}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatTanggal(item.tanggal)} ·{' '}
                          {KATEGORI_PENGELUARAN.find((k) => k.value === item.kategori)
                            ?.label ?? item.kategori}{' '}
                          · {LABEL_METODE[item.metodeBayar]}
                        </p>
                      </div>
                      <span className="tabular shrink-0 text-sm font-semibold text-red-600">
                        − {formatRupiah(item.nominal)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Catat Pengeluaran"
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
          <Field label="Kategori" required>
            {({ id }) => (
              <Select
                id={id}
                value={kategori}
                onChange={(event) =>
                  setKategori(event.target.value as KategoriPengeluaran)
                }
              >
                {KATEGORI_PENGELUARAN.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {kategori === 'REFUND' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Refund pesanan dibuat otomatis saat OWNER membatalkan pesanan
              berbayar. Catat manual hanya untuk refund di luar alur pesanan agar
              tidak terhitung dua kali.
            </p>
          )}
          <Field label="Keterangan" required>
            {({ id }) => (
              <Input
                id={id}
                value={keterangan}
                onChange={(event) => setKeterangan(event.target.value)}
                placeholder="mis. Beli deterjen 4 galon"
                autoFocus
              />
            )}
          </Field>
          <Field label="Nominal (Rp)" required>
            {({ id }) => (
              <Input
                id={id}
                value={nominal}
                onChange={(event) => setNominal(event.target.value)}
                inputMode="numeric"
                className="tabular text-right"
              />
            )}
          </Field>
          <Field label="Dibayar dengan" required>
            {({ id }) => (
              <Select
                id={id}
                value={metode}
                onChange={(event) => setMetode(event.target.value as MetodeBayar)}
              >
                <option value="TUNAI">Tunai</option>
                <option value="QRIS">QRIS</option>
                <option value="TRANSFER">Transfer bank</option>
              </Select>
            )}
          </Field>
        </div>
      </Modal>
    </>
  )
}

export default FinancePage
