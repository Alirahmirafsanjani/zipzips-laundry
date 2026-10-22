import { Prisma } from '@prisma/client'
import { wibDate } from './wib.js'

/**
 * Nomor nota harian: ZZ-YYYYMMDD-0001
 *
 * Angka urut disimpan di tabel `counters` dan dinaikkan secara atomik
 * di dalam transaksi yang sama dengan pembuatan order, sehingga dua kasir
 * yang menekan tombol bersamaan tetap mendapat nomor berbeda.
 */

const PREFIX = 'ZZ'

export function formatOrderNumber(dateStr, seq) {
  const compact = dateStr.replace(/-/g, '')
  return `${PREFIX}-${compact}-${String(seq).padStart(4, '0')}`
}

/**
 * Mengambil nomor urut berikutnya. WAJIB dipanggil di dalam transaksi Prisma
 * agar penomoran tidak bentrok.
 */
export async function nextOrderSequence(tx, date = new Date()) {
  const dateStr = wibDate(date)
  const key = `order:${dateStr}`

  try {
    const counter = await tx.counter.upsert({
      where: { key },
      create: { key, value: 1 },
      update: { value: { increment: 1 } },
    })
    return { dateStr, seq: counter.value }
  } catch (error) {
    // Konflik unik saat dua transaksi upsert bersamaan → ulangi sekali.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const counter = await tx.counter.update({
        where: { key },
        data: { value: { increment: 1 } },
      })
      return { dateStr, seq: counter.value }
    }
    throw error
  }
}

export async function nextOrderNumber(tx, date = new Date()) {
  const { dateStr, seq } = await nextOrderSequence(tx, date)
  return formatOrderNumber(dateStr, seq)
}
