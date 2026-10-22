import config from '../config/index.js'

/**
 * Jejak audit untuk perubahan penting (hapus logika, batalkan pesanan,
 * ubah role user, ubah harga master, adjustment stok, dll).
 *
 * Sengaja TIDAK melempar error: kegagalan menulis audit tidak boleh
 * membatalkan transaksi bisnis yang sudah berhasil.
 */
export async function writeAudit(client, { userId, aksi, entitas, entitasId, detail }) {
  try {
    await client.auditLog.create({
      data: {
        userId: userId ?? null,
        aksi,
        entitas,
        entitasId: entitasId ?? '',
        detail: detail === undefined ? undefined : detail,
      },
    })
  } catch (error) {
    console.error('[audit] gagal menulis jejak audit:', error?.message || error)
  }
}

export function auditDetail(summary, before, after) {
  const detail = { summary }
  if (before !== undefined) detail.sebelum = before
  if (after !== undefined) detail.sesudah = after
  return detail
}

export { config }
