import { Prisma } from '@prisma/client'
import { fail } from '../lib/http.js'
import { HttpError } from '../lib/errors.js'
import config from '../config/index.js'

/**
 * Penampung error terakhir. Semua error dari route (termasuk async) berakhir
 * di sini dan diubah menjadi respons JSON yang konsisten.
 */
export function errorHandler(err, req, res, _next) {
  // Error domain kita sendiri.
  if (err instanceof HttpError) {
    return fail(res, err.status, err.code, err.message, err.details)
  }

  // Error Prisma yang sudah dipetakan.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return fail(
          res,
          409,
          'DUPLICATE',
          'Data duplikat: nilai unik sudah dipakai.',
          { target: err.meta?.target },
        )
      case 'P2025':
        return fail(res, 404, 'NOT_FOUND', 'Data tidak ditemukan atau sudah dihapus.')
      case 'P2003':
        return fail(res, 409, 'FK_CONSTRAINT', 'Data masih terhubung dengan data lain.')
      case 'P2034':
        return fail(
          res,
          409,
          'CONFLICT',
          'Terjadi konflik transaksi. Silakan ulangi sekali lagi.',
        )
      default:
        break
    }
  }

  // Error validasi Zod yang lolos (mis. dipanggil manual di service).
  if (err?.name === 'ZodError') {
    return fail(res, 422, 'VALIDATION_ERROR', 'Data yang dikirim tidak valid.', err.issues)
  }

  console.error('[error]', err)

  return fail(
    res,
    500,
    'INTERNAL_ERROR',
    'Terjadi kesalahan pada server. Silakan coba lagi.',
    config.isDev ? { message: err?.message } : undefined,
  )
}

export default errorHandler
