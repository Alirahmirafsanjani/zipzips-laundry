import { fail } from '../lib/http.js'

/**
 * Membatasi akses berdasarkan peran.
 *
 * Peran:
 *  - OWNER   : akses penuh, termasuk keuangan, pengaturan, void pesanan, master.
 *  - KASIR   : POS, pembayaran, pelanggan, ubah status pengerjaan.
 *  - OPERATOR: hanya ubah status pengerjaan (karangian).
 */
export function requireRole(...roles) {
  const allowed = roles.flat()

  return function authorize(req, res, next) {
    if (!req.user) {
      return fail(res, 401, 'UNAUTHORIZED', 'Anda harus masuk terlebih dahulu.')
    }
    if (!allowed.includes(req.user.role)) {
      return fail(
        res,
        403,
        'FORBIDDEN',
        'Peran Anda tidak memiliki akses untuk aksi ini.',
      )
    }
    return next()
  }
}

/** Hanya pemilik. */
export const requireOwner = requireRole('OWNER')

/** Pemilik atau kasir. */
export const requireOwnerOrKasir = requireRole('OWNER', 'KASIR')

/** Semua peran terotorisasi. */
export const requireAnyRole = requireRole('OWNER', 'KASIR', 'OPERATOR')

export default requireRole
