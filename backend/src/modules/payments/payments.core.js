import { randomUUID } from 'node:crypto'
import { HttpError } from '../../lib/errors.js'

/**
 * Inti pencatatan pembayaran — WAJIB dipanggil di dalam sebuah transaksi
 * (biasanya SERIALIZABLE). Dipakai oleh dua alur:
 *
 *  1. `POST /api/orders/:id/pembayaran` — kasir mencatat pembayaran/DP.
 *  2. `POST /api/orders/:id/serahkan`   — pelanggan mengambil cucian lalu
 *     membayar sisa tagihan sekaligus.
 *
 * Karena keduanya berbagi fungsi ini, aturan kembalian, validasi sisa, dan
 * idempotensi tidak mungkin berbeda antar alur.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {object} order pesanan yang sudah dibaca DI DALAM transaksi
 * @param {{metode: string, nominal: number, referensi?: string|null, catatan?: string|null, idempotencyKey?: string}} input
 * @param {{id: string}} actor
 */
export async function catatPembayaran(tx, order, input, actor) {
  if (order.voidedAt) {
    throw HttpError.conflict(
      'PESANAN_VOID',
      'Pesanan yang sudah dibatalkan tidak bisa menerima pembayaran.',
    )
  }

  const idempotencyKey = input.idempotencyKey || `auto:${randomUUID()}`

  // Sudah pernah dicatat (retry) → kembalikan hasil yang sama.
  const existing = await tx.payment.findUnique({
    where: { idempotencyKey },
    include: { order: true },
  })
  if (existing) {
    // Kunci yang sama tidak boleh "menempel" ke pesanan lain.
    if (existing.orderId !== order.id) {
      throw HttpError.conflict(
        'IDEMPOTENCY_KEY_BENTROK',
        'Kunci idempotensi sudah dipakai pesanan lain. Muat ulang halaman lalu coba lagi.',
      )
    }
    return { payment: existing, order: existing.order, dibuatBaru: false }
  }

  const sisa = order.total - order.totalDibayar
  if (sisa <= 0) {
    throw HttpError.conflict('SUDAH_LUNAS', 'Pesanan ini sudah lunas.')
  }

  if (input.nominal > sisa && input.metode !== 'TUNAI') {
    throw HttpError.unprocessable(
      'NOMINAL_TERLALU_BESAR',
      `Nominal ${input.nominal} melebihi sisa tagihan ${sisa}. Kembalian hanya untuk pembayaran TUNAI.`,
    )
  }

  const kembalian = input.metode === 'TUNAI' ? Math.max(0, input.nominal - sisa) : 0
  const diterima = input.nominal - kembalian

  const payment = await tx.payment.create({
    data: {
      orderId: order.id,
      metode: input.metode,
      nominal: input.nominal,
      kembalian,
      referensi: input.referensi || null,
      catatan: input.catatan || null,
      idempotencyKey,
      createdById: actor.id,
    },
  })

  const orderBaru = await tx.order.update({
    where: { id: order.id },
    data: { totalDibayar: { increment: diterima } },
  })

  return { payment, order: orderBaru, dibuatBaru: true }
}

export default catatPembayaran
