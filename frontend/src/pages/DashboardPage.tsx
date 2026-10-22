import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Package, Receipt, Shirt, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRupiah, formatTanggal, formatAngka } from '@/lib/format'
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/Card'
import { Badge, LABEL_STATUS_ORDER, STATUS_ORDER_TONE } from '@/components/ui/Badge'
import { EmptyState, PageHeader } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Button'
import { useAuth } from '@/hooks/useAuth'
import type { DashboardSummary, Order } from '@/types'

export function DashboardPage() {
  const { user } = useAuth()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [recent, setRecent] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [ringkasan, pesanan] = await Promise.all([
          api.get<DashboardSummary>('/api/dashboard/summary'),
          api.get<Order[]>('/api/orders?limit=6'),
        ])
        if (cancelled) return
        setSummary(ringkasan)
        setRecent(pesanan)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Gagal memuat data.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-7 text-brand-700" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardBody>
          <EmptyState title="Gagal memuat ringkasan" description={error} />
        </CardBody>
      </Card>
    )
  }

  const isOperator = user?.role === 'OPERATOR'

  const maksOmzet = Math.max(
    1,
    ...(summary?.omzetTujuhHari ?? []).map((h) => h.omzet),
  )

  return (
    <>
      <PageHeader
        title={`Halo, ${user?.nama ?? ''}`}
        subtitle={
          isOperator
            ? `Tugas cucian hari ini — ${formatTanggal(summary?.hariIni ?? '')}`
            : `Ringkasan hari ini — ${formatTanggal(summary?.hariIni ?? '')}`
        }
        action={
          user?.role !== 'OPERATOR' && (
            <Link
              to="/pos"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-800"
            >
              <Shirt className="size-4" />
              Laundry Baru
            </Link>
          )
        }
      />

      {isOperator ? (
        /* Karangian: angka operasional saja, tanpa angka uang. */
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Pesanan hari ini"
            value={formatAngka(summary?.jumlahPesananHariIni ?? 0)}
            hint="Cucian masuk hari ini"
            tone="brand"
            icon={<Shirt className="size-4" />}
          />
          <StatCard
            label="Sedang dikerjakan"
            value={formatAngka(summary?.pesananSedangDikerjakan ?? 0)}
            hint="Status diterima & proses"
            icon={<Package className="size-4" />}
          />
          <StatCard
            label="Siap diambil"
            value={formatAngka(summary?.statusCount?.SELESAI ?? 0)}
            hint="Cucian selesai, menunggu pelanggan"
            tone="brand"
            icon={<Receipt className="size-4" />}
          />
          <StatCard
            label="Total pesanan aktif"
            value={formatAngka(summary?.totalPesananAktif ?? 0)}
            hint="Belum diambil pelanggan"
            icon={<TrendingUp className="size-4" />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Omzet hari ini"
            value={formatRupiah(summary?.omzetHariIni ?? 0)}
            hint={`${formatAngka(summary?.jumlahPesananHariIni ?? 0)} pesanan diterima`}
            tone="brand"
            icon={<TrendingUp className="size-4" />}
          />
          <StatCard
            label="Diterima hari ini"
            value={formatRupiah(summary?.diterimaHariIni ?? 0)}
            hint="Kas masuk yang sudah tercatat"
            icon={<Banknote className="size-4" />}
          />
          <StatCard
            label="Belum dibayar"
            value={formatRupiah(summary?.belumDibayarHariIni ?? 0)}
            hint="Sisa tagihan pesanan hari ini"
            tone={summary && (summary.belumDibayarHariIni ?? 0) > 0 ? 'amber' : 'default'}
            icon={<Receipt className="size-4" />}
          />
          <StatCard
            label="Piutang berjalan"
            value={formatRupiah(summary?.piutang ?? 0)}
            hint="Sisa tagihan seluruh pesanan aktif"
            tone={summary && (summary.piutang ?? 0) > 0 ? 'red' : 'default'}
            icon={<Package className="size-4" />}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {!isOperator && (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Omzet 7 hari terakhir"
              subtitle="Berdasarkan tanggal pesanan masuk"
            />
            <CardBody>
              <div className="flex h-40 items-end gap-2">
                {(summary?.omzetTujuhHari ?? []).map((hari) => (
                  <div
                    key={hari.tanggal}
                    className="group flex flex-1 flex-col items-center gap-1.5"
                  >
                    <span className="tabular text-[10px] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">
                      {formatRupiah(hari.omzet)}
                    </span>
                    <div
                      className="w-full rounded-t bg-brand-500 transition-colors group-hover:bg-brand-600"
                      style={{
                        height: `${Math.max(3, (hari.omzet / maksOmzet) * 100)}%`,
                      }}
                    />
                    <span className="tabular text-[10px] text-slate-500">
                      {hari.tanggal.slice(8, 10)}/{hari.tanggal.slice(5, 7)}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        <Card className={isOperator ? 'lg:col-span-3' : undefined}>
          <CardHeader title="Status pengerjaan" subtitle="Pesanan aktif saat ini" />
          <CardBody className="space-y-2.5">
            {(['DITERIMA', 'PROSES', 'SELESAI', 'DIAMBIL'] as const).map((status) => (
              <div
                key={status}
                className="flex items-center justify-between gap-2"
              >
                <Badge tone={STATUS_ORDER_TONE[status]}>
                  {LABEL_STATUS_ORDER[status]}
                </Badge>
                <span className="tabular text-sm font-semibold text-slate-700">
                  {summary?.statusCount?.[status] ?? 0}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Pesanan terbaru"
          action={
            <Link
              to="/pesanan"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Lihat semua
            </Link>
          }
        />
        <CardBody className="p-0">
          {recent.length === 0 ? (
            <EmptyState
              title="Belum ada pesanan"
              description="Pesanan yang baru dibuat akan muncul di sini."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {recent.map((order) => (
                <Link
                  key={order.id}
                  to={`/pesanan/${order.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {order.nomor} — {order.namaPelanggan}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {order.items.length} item · {formatTanggal(order.tanggalMasuk)}
                    </p>
                  </div>
                  <Badge tone={STATUS_ORDER_TONE[order.statusOrder]}>
                    {LABEL_STATUS_ORDER[order.statusOrder]}
                  </Badge>
                  {!isOperator && (
                    <span className="tabular w-28 shrink-0 text-right text-sm font-semibold text-slate-800">
                      {formatRupiah(order.total)}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </>
  )
}

export default DashboardPage
