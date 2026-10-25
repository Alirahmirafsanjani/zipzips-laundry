import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Ban,
  Banknote,
  Check,
  CheckCircle2,
  MessageCircle,
  PackageCheck,
  Phone,
  Printer,
  WashingMachine,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { api, ApiError } from '@/lib/api'
import {
  daysAheadIso,
  formatQty,
  formatRupiah,
  formatTanggal,
  formatTanggalWaktu,
  nomorWhatsApp,
  parseNominal,
  todayIso,
} from '@/lib/format'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Badge, LABEL_STATUS_BAYAR, LABEL_STATUS_ORDER, STATUS_BAYAR_TONE, STATUS_ORDER_TONE } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { Receipt, DEFAULT_STORE, type StoreSettings } from '@/components/Receipt'
import { useAuth } from '@/hooks/useAuth'
import type { MetodeBayar, MetodeHubungi, Order, Payment, StatusOrder } from '@/types'

/**
 * Alur maju yang boleh dilakukan lewat endpoint status.
 * DIAMBIL sengaja tidak ada di sini: serah terima harus melalui modal
 * "Serahkan & Bayar" agar pembayaran/piutang ikut tercatat.
 */
const TRANSISI: Record<StatusOrder, StatusOrder[]> = {
  DITERIMA: ['PROSES'],
  PROSES: ['SELESAI'],
  SELESAI: [],
  DIAMBIL: [],
}

/** Koreksi mundur hanya untuk OWNER bila salah klik. */
const KOREKSI_OWNER: Partial<Record<StatusOrder, StatusOrder>> = {
  PROSES: 'DITERIMA',
  SELESAI: 'PROSES',
  DIAMBIL: 'SELESAI',
}

const TAHAP: Array<{ status: StatusOrder; label: string }> = [
  { status: 'DITERIMA', label: 'Diterima' },
  { status: 'PROSES', label: 'Dicuci' },
  { status: 'SELESAI', label: 'Selesai' },
  { status: 'DIAMBIL', label: 'Diambil' },
]

const LABEL_METODE: Record<MetodeBayar, string> = {
  TUNAI: 'Tunai',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer',
}

const LABEL_HUBUNGI: Record<MetodeHubungi, string> = {
  WHATSAPP: 'WhatsApp',
  TELEPON: 'Telepon',
  LANGSUNG: 'Langsung',
}

/** Default janji bayar piutang: 7 hari dari hari ini (WIB). */
function tujuhHariLagi() {
  return daysAheadIso(7)
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

  const [catatanPengerjaan, setCatatanPengerjaan] = useState('')
  const [menyimpanCatatan, setMenyimpanCatatan] = useState(false)

  const [bayarOpen, setBayarOpen] = useState(false)
  const [metode, setMetode] = useState<MetodeBayar>('TUNAI')
  const [nominal, setNominal] = useState('')
  const [referensi, setReferensi] = useState('')
  const [idempotencyBayar, setIdempotencyBayar] = useState(() => crypto.randomUUID())
  const [membayar, setMembayar] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [alasanVoid, setAlasanVoid] = useState('')
  const [nominalRefund, setNominalRefund] = useState('')
  const [metodeRefund, setMetodeRefund] = useState<MetodeBayar>('TUNAI')
  const [memvoid, setMemvoid] = useState(false)

  // --- Hubungi pelanggan ---
  const [menghubungi, setMenghubungi] = useState(false)
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE)
  const namaToko = settings.namaToko?.trim() || 'ZIP-ZIPS LAUNDRI'

  // --- Serah terima + pembayaran saat pelanggan mengambil ---
  const [serahOpen, setSerahOpen] = useState(false)
  const [bayarSaatAmbil, setBayarSaatAmbil] = useState(true)
  const [metodeSerah, setMetodeSerah] = useState<MetodeBayar>('TUNAI')
  const [nominalSerah, setNominalSerah] = useState('')
  const [referensiSerah, setReferensiSerah] = useState('')
  const [jatuhTempoSerah, setJatuhTempoSerah] = useState(tujuhHariLagi)
  const [idempotencySerah, setIdempotencySerah] = useState(() => crypto.randomUUID())
  const [menyerahkan, setMenyerahkan] = useState(false)

  const muat = useCallback(async () => {
    if (!id) return
    try {
      const data = await api.get<Order>(`/api/orders/${id}`)
      setOrder(data)
      setCatatanPengerjaan(data.catatanPengerjaan ?? '')
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

  // Nama toko dipakai pada pesan WhatsApp dan kepala struk.
  useEffect(() => {
    let cancelled = false
    api
      .get<StoreSettings>('/api/settings')
      .then((data) => {
        if (!cancelled) setSettings({ ...DEFAULT_STORE, ...data })
      })
      .catch(() => {
        /* pakai pengaturan default */
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ubahStatus = async (ke?: StatusOrder) => {
    const target = ke ?? statusBaru
    if (!order || !target) return
    setMenyimpanStatus(true)
    try {
      const updated = await api.patch<Order>(`/api/orders/${order.id}/status`, {
        statusOrder: target,
        catatan: ke ? null : catatanStatus.trim() || null,
      })
      setOrder(updated)
      setStatusBaru('')
      setCatatanStatus('')
      toast.success(
        target === 'PROSES'
          ? 'Cucian mulai dikerjakan.'
          : target === 'SELESAI'
            ? 'Cucian selesai. Sekarang kabari pelanggan agar datang mengambil.'
            : 'Status pesanan diperbarui.',
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mengubah status.')
    } finally {
      setMenyimpanStatus(false)
    }
  }

  const simpanCatatanPengerjaan = async () => {
    if (!order) return
    const nilai = catatanPengerjaan.trim()
    setMenyimpanCatatan(true)
    try {
      const updated = await api.patch<Order>(`/api/orders/${order.id}/catatan`, {
        catatanPengerjaan: nilai || null,
      })
      setOrder(updated)
      setCatatanPengerjaan(updated.catatanPengerjaan ?? '')
      toast.success('Catatan pengerjaan disimpan.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyimpan catatan.')
    } finally {
      setMenyimpanCatatan(false)
    }
  }

  /** Pesan singkat yang dikirim ke pelanggan saat cucian selesai. */
  const pesanSiapDiambil = () => {
    if (!order) return ''
    const sisa = order.sisaTagihan ?? 0
    const tagihan =
      sisa > 0 ? ` Sisa tagihan ${formatRupiah(sisa)}.` : ' Pembayaran sudah lunas.'
    return (
      `Halo ${order.namaPelanggan}, cucian Anda di ${namaToko} ` +
      `dengan nota ${order.nomor} sudah SELESAI dan siap diambil. ` +
      `Total tagihan ${formatRupiah(order.total ?? 0)}.${tagihan} ` +
      `Terima kasih.`
    )
  }

  const catatHubungi = async (via: MetodeHubungi) => {
    if (!order) return
    setMenghubungi(true)
    try {
      const updated = await api.post<Order>(`/api/orders/${order.id}/hubungi`, { via })
      setOrder(updated)
      toast.success(
        `Kontak via ${LABEL_HUBUNGI[via]} tercatat. Pelanggan siap dihubungi lagi bila perlu.`,
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal mencatat kontak.')
    } finally {
      setMenghubungi(false)
    }
  }

  /**
   * Buka WhatsApp lebih dulu (agar tidak diblokir popup), lalu catat kontak.
   * Pesan sudah terisi nomor nota, total, dan sisa tagihan.
   */
  const hubungiWhatsApp = () => {
    if (!order) return
    if (!order.noHp) {
      toast.error('Nomor HP pelanggan belum diisi.')
      return
    }
    const nomor = nomorWhatsApp(order.noHp)
    const url = `https://wa.me/${nomor}?text=${encodeURIComponent(pesanSiapDiambil())}`
    window.open(url, '_blank', 'noopener,noreferrer')
    void catatHubungi('WHATSAPP')
  }

  const bukaSerah = () => {
    if (!order) return
    const sisa = order.sisaTagihan ?? 0
    setMetodeSerah('TUNAI')
    setNominalSerah(String(sisa))
    setReferensiSerah('')
    setJatuhTempoSerah(tujuhHariLagi())
    setBayarSaatAmbil(sisa > 0)
    setIdempotencySerah(crypto.randomUUID())
    setSerahOpen(true)
  }

  const serahkan = async () => {
    if (!order) return
    const sisa = order.sisaTagihan ?? 0
    const perluBayar = sisa > 0 && bayarSaatAmbil
    const nilai = parseNominal(nominalSerah)

    if (perluBayar && nilai <= 0) {
      toast.error('Nominal pembayaran harus lebih dari nol.')
      return
    }
    if (perluBayar && metodeSerah !== 'TUNAI' && nilai > sisa) {
      toast.error('QRIS/transfer tidak boleh melebihi sisa tagihan.')
      return
    }

    setMenyerahkan(true)
    try {
      const result = await api.post<{ order: Order; payment: Payment | null }>(
        `/api/orders/${order.id}/serahkan`,
        {
          ...(perluBayar
            ? {
                pembayaran: {
                  metode: metodeSerah,
                  nominal: nilai,
                  referensi: referensiSerah.trim() || null,
                  idempotencyKey: idempotencySerah,
                },
              }
            : {}),
          ...(sisaSetelahSerah > 0 ? { jatuhTempo: jatuhTempoSerah } : {}),
        },
      )
      setOrder(result.order)
      setSerahOpen(false)
      toast.success(
        result.order.statusPembayaran === 'LUNAS'
          ? 'Cucian diserahkan dan pembayaran lunas.'
          : 'Cucian diserahkan. Sisa tagihan tercatat sebagai piutang.',
      )
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Gagal menyerahkan pesanan.')
    } finally {
      setMenyerahkan(false)
    }
  }

  const bayar = async () => {
    if (!order) return
    const nilai = parseNominal(nominal)
    const sisa = order.sisaTagihan ?? 0
    if (!nilai || nilai <= 0) {
      toast.error('Nominal pembayaran harus lebih dari nol.')
      return
    }
    if (metode !== 'TUNAI' && nilai > sisa) {
      toast.error('QRIS/transfer tidak boleh melebihi sisa tagihan.')
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
          idempotencyKey: idempotencyBayar,
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

  const bukaVoid = () => {
    if (!order) return
    setAlasanVoid('')
    setNominalRefund(String(order.totalDibayar ?? 0))
    setMetodeRefund('TUNAI')
    setVoidOpen(true)
  }

  const voidPesanan = async () => {
    if (!order) return
    if (alasanVoid.trim().length < 3) {
      toast.error('Alasan pembatalan minimal 3 karakter.')
      return
    }

    const totalDibayar = order.totalDibayar ?? 0
    const nilaiRefund = parseNominal(nominalRefund)
    if (totalDibayar > 0 && !nominalRefund.trim()) {
      toast.error('Isi nominal refund — ketik 0 bila uang tidak dikembalikan.')
      return
    }
    if (nilaiRefund > totalDibayar) {
      toast.error('Nominal refund tidak boleh melebihi total pembayaran.')
      return
    }

    setMemvoid(true)
    try {
      const updated = await api.post<Order>(`/api/orders/${order.id}/void`, {
        alasan: alasanVoid.trim(),
        // Refund eksplisit hanya untuk pesanan yang sudah menerima uang.
        // nominal 0 berarti uang tidak dikembalikan (mis. DP hangus).
        ...(totalDibayar > 0
          ? { refund: { nominal: nilaiRefund, metodeBayar: metodeRefund } }
          : {}),
      })
      setOrder(updated)
      setVoidOpen(false)
      setAlasanVoid('')
      setNominalRefund('')
      toast.success(
        totalDibayar > 0 && nilaiRefund > 0
          ? `Pesanan dibatalkan. Refund ${formatRupiah(nilaiRefund)} dicatat sebagai pengeluaran.`
          : 'Pesanan dibatalkan. Tidak ada refund kas yang dicatat.',
      )
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
  const bisaCetak = user?.role !== 'OPERATOR' && !order.voidedAt
  const catatanPengerjaanBerubah =
    catatanPengerjaan.trim() !== (order.catatanPengerjaan ?? '')
  const opsiStatus = [
    ...(TRANSISI[order.statusOrder] ?? []),
    ...(user?.role === 'OWNER' && KOREKSI_OWNER[order.statusOrder]
      ? [KOREKSI_OWNER[order.statusOrder] as StatusOrder]
      : []),
  ]

  const indeksSekarang = TAHAP.findIndex((tahap) => tahap.status === order.statusOrder)
  const kembalianSerah =
    metodeSerah === 'TUNAI' ? Math.max(0, parseNominal(nominalSerah) - sisa) : 0
  const sisaSetelahSerah = bayarSaatAmbil
    ? Math.max(0, sisa - Math.min(parseNominal(nominalSerah), sisa))
    : sisa
  const waktuTahap = (status: StatusOrder): string | null => {
    if (status === 'DITERIMA') return order.tanggalMasuk
    if (status === 'SELESAI') return order.tanggalSelesai ?? null
    if (status === 'DIAMBIL') return order.tanggalDiambil ?? null
    return order.statusHistory?.find((item) => item.ke === 'PROSES')?.pada ?? null
  }

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
          <div className="flex flex-wrap gap-2">
            {bisaCetak && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="size-4" />
                Cetak Nota
              </Button>
            )}

            {bisaBayar && (
              <Button
                variant="outline"
                onClick={() => {
                  setBayarOpen(true)
                  setNominal(String(sisa))
                  setMetode('TUNAI')
                  setReferensi('')
                  setIdempotencyBayar(crypto.randomUUID())
                }}
              >
                <Banknote className="size-4" />
                Catat Pembayaran
              </Button>
            )}

            {!order.voidedAt && order.statusOrder === 'DITERIMA' && (
              <Button onClick={() => ubahStatus('PROSES')} loading={menyimpanStatus}>
                <WashingMachine className="size-4" />
                Mulai Cuci
              </Button>
            )}

            {!order.voidedAt && order.statusOrder === 'PROSES' && (
              <Button onClick={() => ubahStatus('SELESAI')} loading={menyimpanStatus}>
                <CheckCircle2 className="size-4" />
                Tandai Selesai
              </Button>
            )}

            {!order.voidedAt &&
              order.statusOrder === 'SELESAI' &&
              user?.role !== 'OPERATOR' && (
                <Button onClick={bukaSerah}>
                  <PackageCheck className="size-4" />
                  Serahkan &amp; Bayar
                </Button>
              )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardBody>
              <ol className="flex items-start gap-1.5">
                {TAHAP.map((tahap, index) => {
                  const selesai = index <= indeksSekarang
                  const waktu = waktuTahap(tahap.status)
                  return (
                    <li key={tahap.status} className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                            selesai
                              ? 'bg-brand-600 text-white'
                              : 'bg-slate-100 text-slate-400',
                          )}
                        >
                          {selesai ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        {index < TAHAP.length - 1 && (
                          <span
                            className={cn(
                              'h-0.5 flex-1 rounded',
                              index < indeksSekarang ? 'bg-brand-500' : 'bg-slate-200',
                            )}
                          />
                        )}
                      </div>
                      <p
                        className={cn(
                          'mt-1.5 truncate text-xs font-medium',
                          selesai ? 'text-slate-800' : 'text-slate-400',
                        )}
                      >
                        {tahap.label}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {waktu ? formatTanggal(waktu) : '—'}
                      </p>
                    </li>
                  )
                })}
              </ol>
            </CardBody>
          </Card>

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
                        {formatQty(item.qty)} {item.satuan.toLowerCase()}
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

              {user?.role !== 'OPERATOR' && (
                <div className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-sm sm:px-5">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="tabular">{formatRupiah(order.subtotal ?? 0)}</span>
                  </div>
                  {(order.diskon ?? 0) > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>Diskon</span>
                      <span className="tabular">
                        − {formatRupiah(order.diskon ?? 0)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1 text-base font-semibold text-slate-800">
                    <span>Total</span>
                    <span className="tabular">{formatRupiah(order.total ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Sudah dibayar</span>
                    <span className="tabular">
                      {formatRupiah(order.totalDibayar ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Sisa tagihan</span>
                    <span className="tabular text-brand-700">{formatRupiah(sisa)}</span>
                  </div>
                  {sisa > 0 && order.jatuhTempo && (
                    <div className="flex justify-between text-slate-600">
                      <span>Janji bayar</span>
                      <span
                        className={cn(
                          'tabular',
                          new Date(order.jatuhTempo) < new Date() &&
                            'font-semibold text-red-600',
                        )}
                      >
                        {formatTanggal(order.jatuhTempo)}
                      </span>
                    </div>
                  )}
                </div>
              )}
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
          {!order.voidedAt && order.statusOrder === 'SELESAI' && (
            <Card
              className={
                order.dihubungiAt
                  ? 'border-emerald-200'
                  : 'border-amber-300 bg-amber-50/40'
              }
            >
              <CardHeader
                title="Kabari Pelanggan"
                subtitle="Cucian selesai — beri tahu pelanggan agar datang mengambil."
              />
              <CardBody className="space-y-3">
                {order.dihubungiAt ? (
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Sudah dihubungi {formatTanggalWaktu(order.dihubungiAt)}
                    {order.dihubungiVia
                      ? ` via ${LABEL_HUBUNGI[order.dihubungiVia]}`
                      : ''}
                    {order.dihubungiOleh?.nama
                      ? ` oleh ${order.dihubungiOleh.nama}`
                      : ''}
                    {(order.jumlahDihubungi ?? 0) > 1
                      ? ` (${order.jumlahDihubungi}×)`
                      : ''}
                  </div>
                ) : (
                  <p className="text-sm font-medium text-amber-900">
                    Belum dikabari. Hubungi pelanggan sekarang.
                  </p>
                )}

                {order.noHp && (
                  <p className="text-xs text-slate-500">No. HP: {order.noHp}</p>
                )}

                {user?.role === 'OPERATOR' ? (
                  <p className="text-xs text-slate-500">
                    Admin atau kasir yang menghubungi pelanggan.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={hubungiWhatsApp}
                      loading={menghubungi}
                      disabled={!order.noHp}
                    >
                      <MessageCircle className="size-4" />
                      WhatsApp
                    </Button>
                    {order.noHp && (
                      <a
                        href={`tel:${order.noHp.replace(/[^\d+]/g, '')}`}
                        onClick={() => void catatHubungi('TELEPON')}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Phone className="size-4" />
                        Telepon
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => catatHubungi('LANGSUNG')}
                      loading={menghubungi}
                    >
                      Tandai sudah dihubungi
                    </Button>
                  </div>
                )}

                {!order.noHp && user?.role !== 'OPERATOR' && (
                  <p className="text-xs text-amber-800">
                    Nomor HP belum ada. WhatsApp nonaktif — hubungi langsung atau
                    lengkapi data pelanggan.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Catatan Pengerjaan"
              subtitle="Catatan kondisi cucian, instruksi khusus, atau kendala."
            />
            <CardBody className="space-y-2.5">
              <Textarea
                value={catatanPengerjaan}
                onChange={(event) => setCatatanPengerjaan(event.target.value)}
                maxLength={500}
                rows={3}
                disabled={Boolean(order.voidedAt) || menyimpanCatatan}
                placeholder="mis. Noda membandel di bagian kerah, perlu perlakuan khusus"
              />
              {order.voidedAt ? (
                <p className="text-xs text-slate-500">
                  Catatan tidak dapat diubah pada pesanan yang sudah dibatalkan.
                </p>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void simpanCatatanPengerjaan()}
                  loading={menyimpanCatatan}
                  disabled={!catatanPengerjaanBerubah}
                  className="w-full"
                >
                  Simpan Catatan
                </Button>
              )}
            </CardBody>
          </Card>

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
              {order.dihubungiAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Dihubungi</span>
                  <span className="text-right font-medium">
                    {formatTanggalWaktu(order.dihubungiAt)}
                    {order.dihubungiVia
                      ? ` · ${LABEL_HUBUNGI[order.dihubungiVia]}`
                      : ''}
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
                {opsiStatus.length > 0 ? (
                  <>
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
                      onClick={() => ubahStatus()}
                      loading={menyimpanStatus}
                      disabled={!statusBaru}
                      className="w-full"
                    >
                      Simpan Status
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    {order.statusOrder === 'DIAMBIL'
                      ? 'Pesanan sudah diserahkan ke pelanggan (status final).'
                      : order.statusOrder === 'SELESAI'
                        ? user?.role === 'OPERATOR'
                          ? 'Cucian selesai. Serah terima dan pembayaran dilakukan admin/kasir.'
                          : 'Gunakan tombol Serahkan & Bayar untuk menyerahkan cucian.'
                        : 'Tidak ada perubahan status yang tersedia.'}
                  </p>
                )}

                {user?.role === 'OWNER' && (
                  <Button
                    variant="outline"
                    onClick={bukaVoid}
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
                {(order.totalDibayar ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-red-700">
                    Pembayaran {formatRupiah(order.totalDibayar)} tetap tercatat
                    sebagai kas masuk. Refund (bila ada) tercatat di menu
                    Keuangan kategori Refund Pelanggan.
                  </p>
                )}
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

      {/* --- Dialog serah terima + pembayaran --- */}
      <Modal
        open={serahOpen}
        onClose={() => setSerahOpen(false)}
        title="Serahkan Cucian"
        subtitle={`Nota ${order.nomor} · ${order.namaPelanggan}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setSerahOpen(false)}>
              Batal
            </Button>
            <Button onClick={serahkan} loading={menyerahkan}>
              <PackageCheck className="size-4" />
              Serahkan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Total tagihan</span>
              <span className="tabular font-medium">{formatRupiah(order.total ?? 0)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Sudah dibayar</span>
              <span className="tabular font-medium">
                {formatRupiah(order.totalDibayar ?? 0)}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-800">
              <span>Sisa tagihan</span>
              <span className="tabular text-brand-700">{formatRupiah(sisa)}</span>
            </div>
          </div>

          {sisa > 0 ? (
            <>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3">
                <input
                  type="checkbox"
                  checked={bayarSaatAmbil}
                  onChange={(event) => setBayarSaatAmbil(event.target.checked)}
                  className="mt-0.5 size-4 accent-brand-700"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">
                    Pelanggan membayar sekarang
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Matikan bila cucian diambil dulu dan dibayar nanti (tercatat
                    sebagai piutang).
                  </span>
                </span>
              </label>

              {bayarSaatAmbil ? (
                <>
                  <Field label="Metode pembayaran" required>
                    {({ id: fieldId }) => (
                      <Select
                        id={fieldId}
                        value={metodeSerah}
                        onChange={(event) =>
                          setMetodeSerah(event.target.value as MetodeBayar)
                        }
                      >
                        <option value="TUNAI">Tunai</option>
                        <option value="QRIS">QRIS</option>
                        <option value="TRANSFER">Transfer bank</option>
                      </Select>
                    )}
                  </Field>

                  <Field
                    label="Nominal diterima"
                    required
                    hint={
                      metodeSerah === 'TUNAI'
                        ? 'Kembalian dihitung otomatis oleh sistem.'
                        : 'QRIS/transfer tidak boleh melebihi sisa tagihan.'
                    }
                  >
                    {({ id: fieldId }) => (
                      <Input
                        id={fieldId}
                        value={nominalSerah}
                        onChange={(event) => setNominalSerah(event.target.value)}
                        inputMode="numeric"
                        className="tabular text-right text-lg font-semibold"
                      />
                    )}
                  </Field>

                  {metodeSerah === 'QRIS' && (
                    <Field label="Referensi QRIS" hint="Dicatat manual.">
                      {({ id: fieldId }) => (
                        <Input
                          id={fieldId}
                          value={referensiSerah}
                          onChange={(event) => setReferensiSerah(event.target.value)}
                        />
                      )}
                    </Field>
                  )}

                  {metodeSerah === 'TUNAI' && kembalianSerah > 0 && (
                    <div className="flex justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      <span>Kembalian</span>
                      <span className="tabular font-semibold">
                        {formatRupiah(kembalianSerah)}
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Sisa {formatRupiah(sisa)} akan tercatat sebagai piutang dan bisa
                  ditagih saat pelanggan membayar.
                </div>
              )}

              {sisaSetelahSerah > 0 && (
                <Field
                  label="Janji bayar sisa"
                  hint="Dipakai untuk daftar piutang jatuh tempo."
                >
                  {({ id: fieldId }) => (
                    <Input
                      id={fieldId}
                      type="date"
                      min={todayIso()}
                      value={jatuhTempoSerah}
                      onChange={(event) => setJatuhTempoSerah(event.target.value)}
                    />
                  )}
                </Field>
              )}
            </>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Pesanan sudah lunas. Serahkan cucian tanpa mencatat pembayaran.
            </div>
          )}
        </div>
      </Modal>

      {/* --- Dialog pembatalan --- */}
      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Batalkan Pesanan"
        subtitle="Pesanan tidak dihapus. Omzet dibatalkan, tetapi kas yang sudah masuk tetap tercatat."
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
        {(order.totalDibayar ?? 0) > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Pesanan ini sudah menerima pembayaran{' '}
            <span className="font-semibold">
              {formatRupiah(order.totalDibayar)}
            </span>
            . Tentukan uang yang benar-benar dikembalikan. Refund dicatat
            sebagai pengeluaran kategori <strong>Refund Pelanggan</strong>;
            nominal <strong>0</strong> berarti uang tidak dikembalikan.
          </div>
        )}

        <div className="space-y-4">
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

          {(order.totalDibayar ?? 0) > 0 && (
            <>
              <Field
                label="Uang dikembalikan"
                hint="Isi 0 bila DP/uang tidak dikembalikan ke pelanggan."
                required
              >
                {({ id: fieldId }) => (
                  <Input
                    id={fieldId}
                    value={nominalRefund}
                    onChange={(event) => setNominalRefund(event.target.value)}
                    inputMode="numeric"
                    className="tabular text-right text-lg font-semibold"
                  />
                )}
              </Field>

              <Field label="Metode refund">
                {({ id: fieldId }) => (
                  <Select
                    id={fieldId}
                    value={metodeRefund}
                    onChange={(event) =>
                      setMetodeRefund(event.target.value as MetodeBayar)
                    }
                  >
                    <option value="TUNAI">Tunai</option>
                    <option value="QRIS">QRIS</option>
                    <option value="TRANSFER">Transfer bank</option>
                  </Select>
                )}
              </Field>

              {parseNominal(nominalRefund) < (order.totalDibayar ?? 0) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Uang yang ditahan toko:{' '}
                  <span className="tabular font-semibold">
                    {formatRupiah(
                      (order.totalDibayar ?? 0) - parseNominal(nominalRefund),
                    )}
                  </span>
                </div>
              )}
              {parseNominal(nominalRefund) > (order.totalDibayar ?? 0) && (
                <p className="text-sm text-red-600">
                  Refund tidak boleh melebihi total pembayaran.
                </p>
              )}
            </>
          )}
        </div>
      </Modal>

      {bisaCetak && (
        <Receipt
          order={order}
          settings={settings}
          title={
            order.statusOrder === 'DIAMBIL' ? 'BUKTI PENGAMBILAN' : 'NOTA LAUNDRY'
          }
        />
      )}
    </>
  )
}

export default OrderDetailPage
