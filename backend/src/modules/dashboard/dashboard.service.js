import { prisma } from '../../lib/prisma.js'
import { wibDayRange, wibDate, todayWib } from '../../lib/wib.js'

/**
 * Ringkasan untuk layar beranda.
 * Angka hari ini memakai tanggal WIB, bukan tanggal server.
 *
 * Peran:
 *  - OWNER / KASIR : ringkasan lengkap, termasuk angka keuangan.
 *  - OPERATOR      : hanya angka operasional (jumlah pesanan & status).
 *                     Field uang DILEWATI DI SERVER, bukan disembunyikan di
 *                     UI, supaya tidak bisa bocor lewat inspeksi DOM atau
 *                     response API.
 */
export async function summary(role) {
  const hariIni = todayWib()
  const range = wibDayRange(hariIni)

  // Operator tidak boleh melihat agregat uang, jadi query yang menyentuh
  // nominal tidak dijalankan sama sekali untuk peran ini.
  const bolehLihatUang = role !== 'OPERATOR'

  const [
    orderHariIni,
    totalPesananAktif,
    statusGroups,
    tujuhHari,
    piutangAgg,
    pesananSedangDikerjakan,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { voidedAt: null, tanggalMasuk: range },
      select: { total: true, totalDibayar: true },
    }),
    prisma.order.count({ where: { voidedAt: null } }),
    prisma.order.groupBy({
      by: ['statusOrder'],
      where: { voidedAt: null },
      _count: { _all: true },
    }),
    bolehLihatUang
      ? prisma.order.findMany({
          where: {
            voidedAt: null,
            tanggalMasuk: { gte: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
          },
          select: { total: true, tanggalMasuk: true },
        })
      : Promise.resolve([]),
    bolehLihatUang
      ? prisma.order.aggregate({
          where: { voidedAt: null },
          _sum: { total: true, totalDibayar: true },
        })
      : Promise.resolve(null),
    prisma.order.count({ where: { voidedAt: null, statusOrder: { in: ['DITERIMA', 'PROSES'] } } }),
  ])

  const statusCount = { DITERIMA: 0, PROSES: 0, SELESAI: 0, DIAMBIL: 0 }
  for (const group of statusGroups) {
    statusCount[group.statusOrder] = group._count._all
  }

  const dasar = {
    hariIni,
    jumlahPesananHariIni: orderHariIni.length,
    totalPesananAktif,
    pesananSedangDikerjakan,
    statusCount,
  }

  if (!bolehLihatUang) {
    return dasar
  }

  const omzetHariIni = orderHariIni.reduce((sum, o) => sum + o.total, 0)
  const diterimaHariIni = orderHariIni.reduce((sum, o) => sum + o.totalDibayar, 0)

  // Omzet 7 hari terakhir (pivot per tanggal WIB).
  const harianMap = new Map()
  for (let i = 6; i >= 0; i -= 1) {
    const key = wibDate(new Date(Date.now() - i * 24 * 60 * 60 * 1000))
    harianMap.set(key, { tanggal: key, omzet: 0, jumlahPesanan: 0 })
  }
  for (const order of tujuhHari) {
    const key = wibDate(order.tanggalMasuk)
    const slot = harianMap.get(key)
    if (slot) {
      slot.omzet += order.total
      slot.jumlahPesanan += 1
    }
  }

  const piutang = Math.max(
    0,
    (piutangAgg?._sum.total ?? 0) - (piutangAgg?._sum.totalDibayar ?? 0),
  )

  return {
    ...dasar,
    omzetHariIni,
    diterimaHariIni,
    belumDibayarHariIni: omzetHariIni - diterimaHariIni,
    piutang,
    omzetTujuhHari: [...harianMap.values()],
  }
}
