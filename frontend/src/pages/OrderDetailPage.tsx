import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, Banknote, Printer } from 'lucide-react'
import { api, ApiError } from '@/lib/api'
import { formatRupiah, formatTanggal, formatTanggalWaktu } from '@/lib/format'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge, LABEL_STATUS_BAYAR, LABEL_STATUS_ORDER, STATUS_BAYAR_TONE, STATUS_ORDER_TONE } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/hooks/useAuth'
import type { MetodeBayar, Order, StatusOrder } from '@/types'

const TRANSISI: Record<StatusOrder, StatusOrder[]> = {
  DITERIMA: ['PROSES', 'SELESAI'],
  PROSES: ['DITERIMA', 'SELESAI'],
  SELESAI: ['PROSES', 'DIAMBIL'],
  DIAMBIL: ['SELESAI'],
}

const LABEL_METODE: Record<MetodeBayar, string> = {
  TUNAI: 'Tunai',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const { user } = useAuth()

  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [statusBaru, setStatusBaru] = useState<StatusOrder | ''>('')
  const [catatanStatus, setCatatanStatus] = useState('')
  const [menyimpanStatus, setMenyimpanStatus] = useState(false)

  const [bayarOpen, setBayarOpen] = useState(false)
  const [metode, setMetode] = useState<MetodeBayar>('TUNAI')
  const [nominal, setNominal] = useState('')
  const [referensi, setReferensi] = useState('')
  const [membayar, setMembayar] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [alasanVoid, setAlasanVoid] = useState('')
  const [memvoid, setMemvoid] = useState(false)

  const muat = useCallback(async () => {
    if (!id) return
    try {
      const data = await api.get<Order>(`/api/orders/${id}`)
      setOrder(data)
      setNotFound(false)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void muat()
  }, [muat])

  const ubahStatus = async () => {
    if (!order || !statusBaru) return
    setMenyimpanStatus(true)
    try {
      const updated = await api.patch<Order>(`/api/orders/${order.id}/status`, {
        statusOrder: statusBaru,
        catatan: catatanStatus.trim() || null,
      })
      setOrder(updated)
      setStatusBaru('')
      setCatatanStatus('')
      toast.success('Status pesanan diperbarui.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mengubah status.')
    } finally {
      setMenyimpanStatus(false)
    }
  }

  const bayar = async () => {
    if (!order) return
    const nilai = Number(nominal.replace(/\D/g, ''))
    if (!nilai || nilai <= 0) {
      toast.error('Nominal pembayaran harus lebih dari nol.')
      return
    }
    setMembayar(true)
    try {
      const result = await api.post<{ order: Order }>(
        `/api/orders/${order.id}/pembayaran`,
        {
          metode,
          nominal: nilai,
          referensi: referensi.trim() || null,
          idempotencyKey: crypto.randomUUID(),
        },
      )
      setOrder(result.order)
      setBayarOpen(false)
      setNominal('')
      setReferensi('')
      toast.success('Pembayaran berhasil dicatat.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mencatat pembayaran.')
    } finally {
      setMembayar(false)
    }
  }

  const voidPesanan = async () => {
    if (!order) return
    if (alasanVoid.trim().length < 3) {
      toast.error('Alasan pembatalan minimal 3 karakter.')
      return
    }
    setMemvoid(true)
    try {
      const updated = await api.post<Order>(`/api/orders/${order.id}/void`, {
        alasan: alasanVoid.trim(),
      })
      setOrder(updated)
      setVoidOpen(false)
      setAlasanVoid('')
      toast.success('Pesanan dibatalkan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal membatalkan pesanan.')
    } finally {
      setMemvoid(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-7 text-brand-700" />
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            title="Pesanan tidak ditemukan"
            description="Pesanan ini mungkin sudah dihapus atau tautannya salah."
            action={
              <Link
                to="/pesanan"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Kembali ke daftar pesanan
              </Link>
            }
          />
        </CardBody>
      </Card>
    )
  }

  const sisa = order.sisaTagihan ?? 0
  const bisaBayar = user?.role !== 'OPERATOR' && !order.voidedAt && sisa > 0
  const opsiStatus = TRANSISI[order.statusOrder] ?? []

  return (
    <>
      <div className="mb-4">
        <Link
          to="/pesanan"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="size-4" />
          Kembali ke daftar pesanan
        </Link>
      </div>

      <PageHeader
        title={order.nomor}
        subtitle={`${order.namaPelanggan}${order.noHp ? ` · ${order.noHp}` : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              Cetak
            </Button>
            {bisaBayar && (
              <Button
                onClick={() => {
                  setBayarOpen(true)
                  setNominal(String(sisa))
                  setMetode('TUNAI')
                }}
              >
                <Banknote className="size-4" />
                Catat Pembayaran
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Detail Pesanan"
              action={
                <div className="flex gap-1.5">
                  <Badge tone={STATUS_ORDER_TONE[order.statusOrder]}>
                    {LABEL_STATUS_ORDER[order.statusOrder]}
                  </Badge>
                  {user?.role !== 'OPERATOR' && order.statusPembayaran && (
                    <Badge tone={STATUS_BAYAR_TONE[order.statusPembayaran]}>
                      {LABEL_STATUS_BAYAR[order.statusPembayaran]}
                    </Badge>
                  )}
                </div>
              }
            />
            <CardBody className="p-0">
              <div className="divide-y divide-slate-100">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {item.namaService}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.qty} {item.satuan.toLowerCase()}
                        {user?.role !== 'OPERATOR' && item.hargaSatuan !== undefined && (
                          <> × {formatRupiah(item.hargaSatuan)}</>
                        )}
                      </p>
                    </div>
                    {user?.role !== 'OPERATOR' && item.subtotal !== undefined && (
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {formatRupiah(item.subtotal)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-sm sm:px-5">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="tabular">{formatRupiah(order.subtotal ?? 0)}</span>
                </div>
                {(order.diskon ?? 0) > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>Diskon</span>
                    <span className="tabular">− {formatRupiah(order.diskon ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 text-base font-semibold text-slate-800">
                  <span>Total</span>
                  <span className="tabular">{formatRupiah(order.total ?? 0)}</span>
                </div>
                {user?.role !== 'OPERATOR' && (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>Sudah dibayar</span>
                      <span className="tabular">
                        {formatRupiah(order.totalDibayar ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>Sisa tagihan</span>
                      <span className="tabular text-brand-700">
                        {formatRupiah(sisa)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </CardBody>
          </Card>

          {user?.role !== 'OPERATOR' && (
            <Card>
              <CardHeader title="Riwayat Pembayaran" />
              <CardBody className="p-0">
                {(order.payments?.length ?? 0) === 0 ? (
                  <EmptyState title="Belum ada pembayaran" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {order.payments?.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {LABEL_METODE[payment.metode]} —{' '}
                            {formatRupiah(payment.nominal)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatTanggalWaktu(payment.createdAt)}
                            {payment.referensi ? ` · ${payment.referensi}` : ''}
                          </p>
                        </div>
                        {payment.kembalian > 0 && (
                          <span className="tabular shrink-0 text-xs text-amber-700">
                            kembalian {formatRupiah(payment.kembalian)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Informasi" />
            <CardBody className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Masuk</span>
                <span className="text-right font-medium">
                  {formatTanggalWaktu(order.tanggalMasuk)}
                </span>
              </div>
              {order.estimasiSelesai && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Estimasi selesai</span>
                  <span className="text-right font-medium">
                    {formatTanggal(order.estimasiSelesai)}
                  </span>
                </div>
              )}
              {order.tanggalSelesai && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Selesai</span>
                  <span className="text-right font-medium">
                    {formatTanggalWaktu(order.tanggalSelesai)}
                  </span>
                </div>
              )}
              {order.tanggalDiambil && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Diambil</span>
                  <span className="text-right font-medium">
                    {formatTanggalWaktu(order.tanggalDiambil)}
                  </span>
                </div>
              )}
              {order.catatan && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Catatan</span>
                  <span className="text-right">{order.catatan}</span>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">Dibuat oleh</span>
                <span className="text-right font-medium">
                  {order.createdBy?.nama ?? '-'}
                </span>
              </div>
            </CardBody>
          </Card>

          {!order.voidedAt && (
            <Card>
              <CardHeader title="Ubah Status" />
              <CardBody className="space-y-3">
                <Field label="Status baru">
                  {({ id: fieldId }) => (
                    <Select
                      id={fieldId}
                      value={statusBaru}
                      onChange={(event) =>
                        setStatusBaru(event.target.value as StatusOrder | '')
                      }
                    >
                      <option value="">Pilih status…</option>
                      {opsiStatus.map((status) => (
                        <option key={status} value={status}>
                          {LABEL_STATUS_ORDER[status]}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Catatan (opsional)">
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      value={catatanStatus}
                      onChange={(event) => setCatatanStatus(event.target.value)}
                      placeholder="mis. Sudah dicuci, sedang dijemur"
                    />
                  )}
                </Field>

                <Button
                  onClick={ubahStatus}
                  loading={menyimpanStatus}
                  disabled={!statusBaru}
                  className="w-full"
                >
                  Simpan Status
                </Button>

                {user?.role === 'OWNER' && (
                  <Button
                    variant="outline"
                    onClick={() => setVoidOpen(true)}
                    className="w-full text-red-600 hover:bg-red-50"
                  >
                    <Ban className="size-4" />
                    Batalkan Pesanan
                  </Button>
                )}
              </CardBody>
            </Card>
          )}

          {order.voidedAt && (
            <Card className="border-red-200 bg-red-50">
              <CardBody>
                <p className="text-sm font-medium text-red-800">
                  Pesanan ini dibatalkan
                </p>
                <p className="mt-1 text-sm text-red-700">{order.voidAlasan}</p>
                <p className="mt-1 text-xs text-red-600">
                  {formatTanggalWaktu(order.voidedAt)}
                </p>
              </CardBody>
            </Card>
          )}

          {order.statusHistory && order.statusHistory.length > 0 && (
            <Card>
              <CardHeader title="Riwayat Status" />
              <CardBody>
                <ol className="space-y-3">
                  {order.statusHistory.map((history) => (
                    <li key={history.id} className="flex gap-3">
                      <div className="mt-1 size-2 shrink-0 rounded-full bg-brand-500" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {history.dari
                            ? `${LABEL_STATUS_ORDER[history.dari]} → ${LABEL_STATUS_ORDER[history.ke]}`
                            : LABEL_STATUS_ORDER[history.ke]}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatTanggalWaktu(history.pada)} · {history.oleh?.nama}
                        </p>
                        {history.catatan && (
                          <p className="mt-0.5 text-xs text-slate-600">
                            {history.catatan}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* --- Dialog pembayaran --- */}
      <Modal
        open={bayarOpen}
        onClose={() => setBayarOpen(false)}
        title="Catat Pembayaran"
        subtitle={`Sisa tagihan ${formatRupiah(sisa)}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBayarOpen(false)}>
              Batal
            </Button>
            <Button onClick={bayar} loading={membayar}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Metode" required>
            {({ id: fieldId }) => (
              <Select
                id={fieldId}
                value={metode}
                onChange={(event) => setMetode(event.target.value as MetodeBayar)}
              >
                <option value="TUNAI">Tunai</option>
                <option value="QRIS">QRIS</option>
                <option value="TRANSFER">Transfer bank</option>
              </Select>
            )}
          </Field>

          <Field label="Nominal" required>
            {({ id: fieldId }) => (
              <Input
                id={fieldId}
                value={nominal}
                onChange={(event) => setNominal(event.target.value)}
                inputMode="numeric"
                className="tabular text-right text-lg font-semibold"
              />
            )}
          </Field>

          {metode === 'QRIS' && (
            <Field label="Referensi QRIS" hint="Dicatat manual dari aplikasi QRIS.">
              {({ id: fieldId }) => (
                <Input
                  id={fieldId}
                  value={referensi}
                  onChange={(event) => setReferensi(event.target.value)}
                />
              )}
            </Field>
          )}

          {metode === 'TUNAI' && Number(nominal.replace(/\D/g, '')) > sisa && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Kembalian{' '}
              <span className="tabular font-semibold">
                {formatRupiah(Number(nominal.replace(/\D/g, '')) - sisa)}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* --- Dialog pembatalan --- */}
      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Batalkan Pesanan"
        subtitle="Pesanan tidak dihapus, ditandai dibatalkan dan dikeluarkan dari laporan."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Batal
            </Button>
            <Button variant="danger" onClick={voidPesanan} loading={memvoid}>
              Ya, batalkan
            </Button>
          </>
        }
      >
        <Field label="Alasan pembatalan" required>
          {({ id: fieldId }) => (
            <Input
              id={fieldId}
              value={alasanVoid}
              onChange={(event) => setAlasanVoid(event.target.value)}
              placeholder="mis. Pelanggan membatalkan pesanan"
            />
          )}
        </Field>
      </Modal>
    </>
  )
}

export default OrderDetailPage
