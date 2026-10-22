import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'
import { wibRange, wibDate, todayWib } from '../../lib/wib.js'

/**
 * =============================================================================
 * DEFINISI METRIK KEUANGAN (WAJIB DIPAHAMI SEBELUM MENGGUNAKAN LAPORAN)
 * =============================================================================
 *
 * 1. OMZET
 *    = SUM(Order.total) untuk pesanan yang BELUM dibatalkan, dihitung
 *      berdasarkan tanggal pesanan masuk (tanggalMasuk).
 *    Melqvfaq omzet = nilai pekerjaan yang DITERIMA, bukan uang yang sudah masuk.
 *
 * 2. PENERIMAAN KAS
 *    = SUM(Payment.nominal - Payment.kembalian) + SUM(OtherIncome.nominal)
 *      dihitung berdasarkan TANGGAL PENERIMAAN (bukan tanggal pesanan).
 *    Pembayaran dari pesanan yang dibatalkan (void) TIDAK dihitung.
 *
 * 3. PENGELUARAN
 *    = SUM(Expense.nominal) berdasarkan tanggal pengeluaran.
 *
 * 4. PIUTANG
 *    = SUM(Order.total - Order.totalDibayar) untuk SEMUA pesanan aktif,
 *      tanpa dibatasi rentang tanggal. Sisa tagihan yang belum tertagih.
 *
 * 5. LABA KAS
 *    = PENERIMAAN KAS - PENGELUARAN
 *    INI BUKAN LABA BERSIH. HPP (bahan baku, listrik per kg, biaya karangian)
 *    BELUM dihitung di MVP. Angka ini dipakai untuk melihat arus kas, bukan
 *    untuk menghitung profit.
 * =============================================================================
 */

function parseTanggalWib(tanggal) {
  const str = tanggal || todayWib()
  const date = new Date(`${str}T00:00:00+07:00`)
  if (Number.isNaN(date.getTime())) {
    throw HttpError.unprocessable('TANGGAL_INVALID', `Tanggal "${str}" tidak valid.`)
  }
  return date
}

export async function ringkasan({ dari, sampai }) {
  const range = wibRange(dari || '1970-01-01', sampai || '2999-12-31')

  const [orders, payments, otherIncomes, expenses, piutangAgg] = await Promise.all([
    // Omzet — berdasarkan tanggal pesanan masuk.
    prisma.order.findMany({
      where: { voidedAt: null, tanggalMasuk: range },
      select: { total: true, tanggalMasuk: true, statusOrder: true, totalDibayar: true },
    }),

    // Penerimaan kas dari laundry — berdasarkan tanggal pembayaran.
    prisma.payment.findMany({
      where: { order: { voidedAt: null }, createdAt: range },
      select: { nominal: true, kembalian: true, metode: true, createdAt: true },
    }),

    prisma.otherIncome.findMany({
      where: { tanggal: range },
      select: { nominal: true, tanggal: true, kategori: true, metodeBayar: true },
    }),

    prisma.expense.findMany({
      where: { tanggal: range },
      select: { nominal: true, tanggal: true, kategori: true },
    }),

    // Piutang — seluruh riwayat, tidak dibatasi rentang.
    prisma.order.aggregate({
      where: { voidedAt: null },
      _sum: { total: true, totalDibayar: true },
    }),
  ])

  const omzet = orders.reduce((sum, o) => sum + o.total, 0)

  const penerimaanLaundry = payments.reduce((sum, p) => sum + (p.nominal - p.kembalian), 0)
  const penerimaanLain = otherIncomes.reduce((sum, o) => sum + o.nominal, 0)
  const penerimaanKas = penerimaanLaundry + penerimaanLain

  const pengeluaran = expenses.reduce((sum, e) => sum + e.nominal, 0)
  const labaKas = penerimaanKas - pengeluaran

  const piutang = Math.max(
    0,
    (piutangAgg._sum.total ?? 0) - (piutangAgg._sum.totalDibayar ?? 0),
  )

  // --- Rincian harian -------------------------------------------------------
  const harian = new Map()
  const ambilSlot = (tanggal) => {
    const key = wibDate(tanggal)
    if (!harian.has(key)) {
      harian.set(key, { tanggal: key, omzet: 0, penerimaan: 0, pengeluaran: 0, jumlahPesanan: 0 })
    }
    return harian.get(key)
  }

  for (const order of orders) {
    const slot = ambilSlot(order.tanggalMasuk)
    slot.omzet += order.total
    slot.jumlahPesanan += 1
  }
  for (const payment of payments) {
    ambilSlot(payment.createdAt).penerimaan += payment.nominal - payment.kembalian
  }
  for (const income of otherIncomes) {
    ambilSlot(income.tanggal).penerimaan += income.nominal
  }
  for (const expense of expenses) {
    ambilSlot(expense.tanggal).pengeluaran += expense.nominal
  }

  const harianList = [...harian.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal))

  // --- Rincian per metode pembayaran ---------------------------------------
  const perMetode = {}
  for (const payment of payments) {
    perMetode[payment.metode] = (perMetode[payment.metode] ?? 0) + (payment.nominal - payment.kembalian)
  }

  // --- Rincian pengeluaran per kategori -------------------------------------
  const perKategoriPengeluaran = {}
  for (const expense of expenses) {
    perKategoriPengeluaran[expense.kategori] =
      (perKategoriPengeluaran[expense.kategori] ?? 0) + expense.nominal
  }

  const perKategoriPemasukanLain = {}
  for (const income of otherIncomes) {
    perKategoriPemasukanLain[income.kategori] =
      (perKategoriPemasukanLain[income.kategori] ?? 0) + income.nominal
    // Pemasukan lain juga masuk ke rincian per metode agar ringkasan kas
    // per metode cocok dengan total penerimaan kas.
    perMetode[income.metodeBayar] =
      (perMetode[income.metodeBayar] ?? 0) + income.nominal
  }

  return {
    rentang: { dari: dari || null, sampai: sampai || null },
    omzet,
    penerimaanKas,
    penerimaanLaundry,
    penerimaanLain,
    pengeluaran,
    labaKas,
    piutang,
    jumlahPesanan: orders.length,
    perMetode,
    perKategoriPengeluaran,
    perKategoriPemasukanLain,
    harian: harianList,
    catatan: {
      labaKas:
        'Laba kas = penerimaan kas - pengeluaran. BUKAN laba bersih: HPP bahan baku & biaya lainnya belum dihitung.',
      piutang: 'Piutang = seluruh sisa tagihan pesanan aktif, lintas tanggal.',
      omzet: 'Omzet dihitung berdasarkan tanggal pesanan masuk, bukan tanggal pembayaran.',
    },
  }
}

export async function listExpenses(query) {
  const where = {}
  if (query.kategori) where.kategori = query.kategori
  if (query.dari || query.sampai) {
    where.tanggal = wibRange(query.dari || '1970-01-01', query.sampai || '2999-12-31')
  }

  const [items, total, agregat] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { createdBy: { select: { id: true, nama: true } } },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { nominal: true } }),
  ])

  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
      totalNominal: agregat._sum.nominal ?? 0,
    },
  }
}

export async function createExpense(input, actor) {
  const tanggal = parseTanggalWib(input.tanggal)

  const expense = await prisma.expense.create({
    data: {
      tanggal,
      kategori: input.kategori,
      keterangan: input.keterangan,
      nominal: input.nominal,
      metodeBayar: input.metodeBayar,
      refType: input.refType || null,
      refId: input.refId || null,
      createdById: actor.id,
    },
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'CATAT_PENGELUARAN',
    entitas: 'Expense',
    entitasId: expense.id,
    detail: {
      summary: `Pengeluaran ${expense.kategori} Rp${expense.nominal}: ${expense.keterangan}`,
    },
  })

  return expense
}

export async function listOtherIncomes(query) {
  const where = {}
  if (query.kategori) where.kategori = query.kategori
  if (query.dari || query.sampai) {
    where.tanggal = wibRange(query.dari || '1970-01-01', query.sampai || '2999-12-31')
  }

  const [items, total, agregat] = await Promise.all([
    prisma.otherIncome.findMany({
      where,
      include: { createdBy: { select: { id: true, nama: true } } },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.otherIncome.count({ where }),
    prisma.otherIncome.aggregate({ where, _sum: { nominal: true } }),
  ])

  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
      totalNominal: agregat._sum.nominal ?? 0,
    },
  }
}

export async function createOtherIncome(input, actor) {
  const tanggal = parseTanggalWib(input.tanggal)

  const income = await prisma.otherIncome.create({
    data: {
      tanggal,
      kategori: input.kategori,
      keterangan: input.keterangan,
      nominal: input.nominal,
      metodeBayar: input.metodeBayar,
      createdById: actor.id,
    },
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'CATAT_PEMASUKAN_LAIN',
    entitas: 'OtherIncome',
    entitasId: income.id,
    detail: {
      summary: `Pemasukan lain ${income.kategori} Rp${income.nominal}: ${income.keterangan}`,
    },
  })

  return income
}

/** Ekspor CSV sederhana (tanpa dependensi tambahan). */
export function toCsv(rows, headers) {
  const escape = (value) => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`
    return str
  }

  const header = headers.map((h) => escape(h.label)).join(';')
  const body = rows.map((row) => headers.map((h) => escape(row[h.key])).join(';'))
  return [header, ...body].join('\n')
}
