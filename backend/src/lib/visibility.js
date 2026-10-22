/**
 * Visibilitas data per peran.
 *
 * Prinsip: pembatasan dilakukan DI SERVER, bukan dengan menyembunyikan
 * elemen di UI. Kalau hanya disembunyikan di UI, angka keuangan masih bisa
 * dibaca lewat DevTools atau response API — yang justru undermines
 * requirement "karangian tidak melihat angka keuangan".
 *
 * Peran:
 *  - OWNER / KASIR : data penuh.
 *  - OPERATOR      : data operasional (identitas pesanan, item, status
 *                    pengerjaan). Field yang berisi nominal rupiah DIBUANG
 *                    dari respons, bukan hanya disembunyikan.
 */

/** Nama field pesanan yang berisi angka uang. */
const FIELD_UANG = [
  'subtotal',
  'diskon',
  'total',
  'totalDibayar',
  'sisaTagihan',
  'statusPembayaran',
  'payments',
]

/**
 * Buang field keuangan dari sebuah pesanan bila peran tidak berhak.
 * Objek asli TIDAK dimodifikasi.
 */
export function scrubOrder(order, role) {
  if (!order || role !== 'OPERATOR') return order

  const result = { ...order }
  for (const field of FIELD_UANG) {
    delete result[field]
  }

  if (Array.isArray(result.items)) {
    result.items = result.items.map((item) => {
      const clean = { ...item }
      delete clean.hargaSatuan
      delete clean.subtotal
      return clean
    })
  }

  return result
}

/** Buang field keuangan dari banyak pesanan. */
export function scrubOrders(orders, role) {
  if (!Array.isArray(orders)) return orders
  return orders.map((order) => scrubOrder(order, role))
}
