import { Prisma } from '@prisma/client'
import config from '../config/index.js'

/**
 * Menjalankan sebuah operasi dalam transaksi dengan isolation level SERIALIZABLE
 * dan mengulang otomatis bila terjadi konflik (P2034).
 *
 * Dipakai untuk operasi yang rawan-race seperti pencatatan pembayaran:
 * tanpa SERIALIZABLE, dua kasir bisa sama-sama membaca sisa tagihan yang sama
 * lalu dua-duanya deems pembayaran cukup sehingga over-payment lolos.
 */
export async function withSerializableRetry(fn, maxAttempts = 3) {
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const isConflict =
        error?.code === 'P2034' ||
        (error?.meta?.code === 'P2034') ||
        /could not serialize access/i.test(error?.message || '')

      if (!isConflict || attempt === maxAttempts) throw error

      // Backoff eksponensial singkat.
      await new Promise((resolve) => setTimeout(resolve, 25 * attempt))
    }
  }

  throw lastError
}

/** Helper untuk membungkus callback transaksi Prisma dengan retry. */
export function serializableTransaction(prisma, fn, options = {}) {
  return withSerializableRetry(() =>
    prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      ...options,
    }),
  )
}

export default serializableTransaction
