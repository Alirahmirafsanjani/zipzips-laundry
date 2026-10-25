import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, MessageCircle, Search } from 'lucide-react'
import { requestWithMeta } from '@/lib/api'
import { formatRupiah, formatTanggal } from '@/lib/format'
import { Card, CardBody } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge, LABEL_STATUS_BAYAR, LABEL_STATUS_ORDER, STATUS_BAYAR_TONE, STATUS_ORDER_TONE } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import type { Order, StatusOrder } from '@/types'

const STATUS_OPTIONS: Array<{ value: '' | StatusOrder; label: string }> = [
  { value: '', label: 'Semua status' },
  { value: 'DITERIMA', label: 'Diterima' },
  { value: 'PROSES', label: 'Proses' },
  { value: 'SELESAI', label: 'Selesai' },
  { value: 'DIAMBIL', label: 'Diambil' },
]

export function OrdersPage() {
  const { user } = useAuth()
  const isOperator = user?.role === 'OPERATOR'
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [meta, setMeta] = useState<{ page: number; totalPages: number; total: number } | null>(
    null,
  )
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [status, setStatus] = useState<'' | StatusOrder>(() => {
    const value = searchParams.get('status')
    return value === 'DITERIMA' ||
      value === 'PROSES' ||
      value === 'SELESAI' ||
      value === 'DIAMBIL'
      ? value
      : ''
  })
  const [belumDihubungi, setBelumDihubungi] = useState(
    () => searchParams.get('belumDihubungi') === 'true',
  )
  const [jatuhTempo, setJatuhTempo] = useState(
    () => searchParams.get('jatuhTempo') === 'true',
  )
  const [page, setPage] = useState(1)

  const muat = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (jatuhTempo) params.set('jatuhTempo', 'true')
      else if (belumDihubungi) params.set('belumDihubungi', 'true')
      else if (status) params.set('status', status)
      params.set('page', String(page))
      params.set('limit', '20')

      const result = await requestWithMeta<Order[]>(`/api/orders?${params.toString()}`)
      setOrders(result.data)
      setMeta(
        result.meta as unknown as { page: number; totalPages: number; total: number } | null,
      )
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [search, status, belumDihubungi, jatuhTempo, page])

  useEffect(() => {
    void muat()
  }, [muat])

  const gantiStatus = (value: '' | StatusOrder) => {
    setStatus(value)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Pesanan"
        subtitle="Daftar seluruh pesanan laundry beserta status pengerjaan."
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Cari nomor nota, nama, atau no. HP…"
                className="pl-9"
              />
            </div>
            <Select
              value={belumDihubungi || jatuhTempo ? '' : status}
              onChange={(event) => gantiStatus(event.target.value as '' | StatusOrder)}
              className="sm:w-48"
              disabled={belumDihubungi || jatuhTempo}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              variant={belumDihubungi ? 'primary' : 'outline'}
              onClick={() => {
                setBelumDihubungi((value) => !value)
                setJatuhTempo(false)
                setPage(1)
              }}
              className="shrink-0"
            >
              <MessageCircle className="size-4" />
              Belum dihubungi
            </Button>
            {!isOperator && (
              <Button
                variant={jatuhTempo ? 'primary' : 'outline'}
                onClick={() => {
                  setJatuhTempo((value) => !value)
                  setBelumDihubungi(false)
                  setPage(1)
                }}
                className="shrink-0"
              >
                <CalendarClock className="size-4" />
                Jatuh tempo
              </Button>
            )}
          </div>

          {belumDihubungi && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Menampilkan cucian <strong>SELESAI</strong> yang pelanggannya belum
              dikabari.{' '}
              {isOperator
                ? 'Admin/kasir yang menghubungi pelanggan.'
                : 'Buka pesanan untuk mengirim WhatsApp atau menandai sudah dihubungi.'}
            </p>
          )}

          {jatuhTempo && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              Menampilkan piutang yang sudah melewati tanggal janji bayar dan
              belum lunas. Hubungi pelanggan untuk penagihan.
            </p>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="size-6 text-brand-700" />
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              title="Tidak ada pesanan"
              description="Belum ada pesanan yang cocok dengan filter ini."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <th className="px-4 py-2.5 font-medium sm:px-5">Nota</th>
                    <th className="px-4 py-2.5 font-medium">Pelanggan</th>
                    <th className="px-4 py-2.5 font-medium">Tanggal</th>
                    <th className="px-4 py-2.5 font-medium">Pengerjaan</th>
                    <th className="px-4 py-2.5 font-medium">Bayar</th>
                    <th className="px-4 py-2.5 text-right font-medium sm:px-5">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 sm:px-5">
                        <Link
                          to={`/pesanan/${order.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          {order.nomor}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {order.namaPelanggan}
                        </p>
                        {order.noHp && (
                          <p className="text-xs text-slate-500">{order.noHp}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatTanggal(order.tanggalMasuk)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge tone={STATUS_ORDER_TONE[order.statusOrder]}>
                            {LABEL_STATUS_ORDER[order.statusOrder]}
                          </Badge>
                          {order.statusOrder === 'SELESAI' && !order.dihubungiAt && (
                            <Badge tone="amber">Belum dihubungi</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {user?.role === 'OPERATOR' ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : order.statusPembayaran ? (
                          <Badge tone={STATUS_BAYAR_TONE[order.statusPembayaran]}>
                            {LABEL_STATUS_BAYAR[order.statusPembayaran]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="tabular px-4 py-3 text-right font-semibold text-slate-800 sm:px-5">
                        {user?.role === 'OPERATOR' ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          formatRupiah(order.total ?? 0)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1 text-sm">
              <span className="text-slate-500">
                Halaman {meta.page} dari {meta.totalPages} ({meta.total} pesanan)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </>
  )
}

export default OrdersPage
