/**
 * Aturan turunan status pembayaran.
 *
 * Dipisah dari modul orders agar bisa dipakai bersama oleh modul payments
 * tanpa membuat impor melingkar.
 */

/** Sisa tagihan = total - totalDibayar. */
export function sisaTagihan(order) {
  return Math.max(0, order.total - order.totalDibayar)
}

/** Status pembayaran DITURUNKAN, tidak disimpan. */
export function statusPembayaran(order) {
  if (order.voidedAt) return 'VOID'
  // Pesanan gratis (diskon penuh) tidak punya tagihan, jadi langsung LUNAS.
  if (order.total <= 0) return 'LUNAS'
  if (order.totalDibayar <= 0) return 'BELUM_BAYAR'
  if (order.totalDibayar < order.total) return 'SEBAGIAN'
  return 'LUNAS'
}
