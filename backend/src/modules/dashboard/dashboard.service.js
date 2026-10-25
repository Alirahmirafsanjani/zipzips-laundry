import { prisma } from '../../lib/prisma.js'
import { wibDayRange, wibDate, wibRange, todayWib } from '../../lib/wib.js'

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
  // Tujuh hari KALENDER penuh, bukan 6×24 jam bergulir yang memotong
  // sebagian hari paling awal pada grafik.
  const tujuhHariMulai = wibDate(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000))
  const rangeTujuhHari = wibRange(tujuhHariMulai, hariIni)

  // Operator tidak boleh melihat agregat uang, jadi query yang menyentuh
  // nominal tidak dijalankan sama sekali untuk peran ini.
  const bolehLihatUang = role !== 'OPERATOR'

  const [
    orderHariIni,
    penerimaanHariIni,
    pemasukanLainHariIni,
    totalPesananAktif,
    statusGroups,
    tujuhHari,
    piutangAgg,
    pesananSedangDikerjakan,
    belumDihubungi,
    piutangJatuhTempoOrders,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { voidedAt: null, tanggalMasuk: range },
      select: bolehLihatUang
        ? { total: true, totalDibayar: true }
        : { id: true },
    }),
    bolehLihatUang
      ? prisma.payment.findMany({
          where: { createdAt: range },
          select: { nominal: true, kembalian: true },
        })
      : Promise.resolve([]),
    bolehLihatUang
      ? prisma.otherIncome.findMany({
          where: { tanggal: range },
          select: { nominal: true },
        })
      : Promise.resolve([]),
    // "Aktif" berarti masih berada di outlet, belum diambil pelanggan.
    prisma.order.count({ where: { voidedAt: null, statusOrder: { not: 'DIAMBIL' } } }),
    prisma.order.groupBy({
      by: ['statusOrder'],
      where: { voidedAt: null },
      _count: { _all: true },
    }),
    bolehLihatUang
      ? prisma.order.findMany({
          where: {
            voidedAt: null,
            tanggalMasuk: rangeTujuhHari,
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
    prisma.order.count({
      where: { voidedAt: null, statusOrder: 'SELESAI', dihubungiAt: null },
    }),
    bolehLihatUang
      ? prisma.order.findMany({
          where: {
            voidedAt: null,
            jatuhTempo: { not: null, lte: new Date() },
          },
          select: { total: true, totalDibayar: true },
        })
      : Promise.resolve([]),
  ])

  const statusCount = { DITERIMA: 0, PROSES: 0, SELESAI: 0, DIAMBIL: 0 }
  for (const group of statusGroups) {
    statusCount[group.statusOrder] = group._count._all
  }

  const jatuhTempoAktif = piutangJatuhTempoOrders.filter(
    (order) => order.totalDibayar < order.total,
  )
  const piutangJatuhTempoNominal = jatuhTempoAktif.reduce(
    (sum, order) => sum + (order.total - order.totalDibayar),
    0,
  )

  const dasar = {
    hariIni,
    jumlahPesananHariIni: orderHariIni.length,
    totalPesananAktif,
    pesananSedangDikerjakan,
    // Cucian selesai yang pelanggannya belum diberi kabar — tugas admin.
    belumDihubungi,
    piutangJatuhTempo: jatuhTempoAktif.length,
    statusCount,
  }

  if (!bolehLihatUang) {
    return dasar
  }

  const omzetHariIni = orderHariIni.reduce((sum, o) => sum + o.total, 0)
  // Kas masuk mengikuti TANGGAL PEMBAYARAN, bukan tanggal pesanan. Ini juga
  // membuat dashboard tetap jujur setelah pesanan void: uang yang pernah masuk
  // tidak hilang, refund muncul sebagai pengeluaran.
  const diterimaHariIni =
    penerimaanHariIni.reduce((sum, p) => sum + (p.nominal - p.kembalian), 0) +
    pemasukanLainHariIni.reduce((sum, o) => sum + o.nominal, 0)
  const belumDibayarHariIni = orderHariIni.reduce(
    (sum, o) => sum + Math.max(0, o.total - o.totalDibayar),
    0,
  )

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
    belumDibayarHariIni,
    piutang,
    piutangJatuhTempoNominal,
    omzetTujuhHari: [...harianMap.values()],
  }
}
