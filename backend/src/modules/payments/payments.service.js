import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'
import { serializableTransaction } from '../../lib/transaction.js'
import { wibRange } from '../../lib/wib.js'
import { getById } from '../orders/orders.service.js'
import { catatPembayaran } from './payments.core.js'

/**
 * Mencatat pembayaran pada sebuah pesanan.
 *
 * Aturan penting:
 *  1. `kembalian` SELALU dihitung server (hanya boleh untuk TUNAI).
 *  2. Transaksi memakai isolation SERIALIZABLE → dua kasir yang menekan
 *     tombol bersamaan tidak bisa menyebabkan over-payment.
 *  3. `idempotencyKey` UNIQUE → klik ganda / retry jaringan aman.
 *  4. Transaksi tidak pernah dihapus. Koreksi dilakukan lewat void/refund.
 *
 * Logika inti ada di `payments.core.js` agar dipakai bersama alur serah terima
 * (`serahkan`) tanpa duplikasi aturan.
 */
export async function createPayment(orderId, input, actor) {
  const hasil = await serializableTransaction(prisma, async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } })
    if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')

    return catatPembayaran(tx, order, input, actor)
  })

  if (hasil.dibuatBaru) {
    await writeAudit(prisma, {
      userId: actor.id,
      aksi: 'CATAT_PEMBAYARAN',
      entitas: 'Payment',
      entitasId: hasil.payment.id,
      detail: {
        summary: `Pembayaran ${hasil.payment.metode} Rp${hasil.payment.nominal} untuk pesanan ${hasil.order.nomor}`,
        kembalian: hasil.payment.kembalian,
      },
    })
  }

  return {
    payment: hasil.payment,
    // Kembalikan pesanan lengkap (item, riwayat, pembayaran) agar layar POS
    // dan detail pesanan tidak kehilangan data setelah mencatat pembayaran.
    order: await getById(orderId, actor.role),
    dibuatBaru: hasil.dibuatBaru,
  }
}

export async function list(query) {
  const where = {}

  if (query.metode) where.metode = query.metode
  if (query.orderId) where.orderId = query.orderId

  if (query.dari || query.sampai) {
    const dari = query.dari || '1970-01-01'
    const sampai = query.sampai || '2999-12-31'
    where.createdAt = wibRange(dari, sampai)
  }

  // Pembayaran pada pesanan void tetap ditampilkan: uangnya benar-benar
  // pernah masuk dan refund dicatat terpisah sebagai pengeluaran REFUND.

  const [items, total, agregat] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        order: {
          select: { id: true, nomor: true, namaPelanggan: true, voidedAt: true },
        },
        createdBy: { select: { id: true, nama: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: { nominal: true, kembalian: true },
    }),
  ])

  const nominal = agregat._sum.nominal ?? 0
  const kembalian = agregat._sum.kembalian ?? 0

  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
      totalNominal: nominal,
      totalKembalian: kembalian,
      totalDiterima: nominal - kembalian,
    },
  }
}
