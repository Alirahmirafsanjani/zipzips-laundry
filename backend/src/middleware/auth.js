import { fail } from '../lib/http.js'
import { verifyToken } from '../lib/token.js'

/**
 * Wajib login. Token dibaca dari header `Authorization: Bearer <token>`.
 *
 * Dipakai untuk MVP: sesuai pola STIMBADUTA, token disimpan di localStorage
 * frontend. consciously diterima risikonya (XSS) untuk MVP single-device.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''

  if (!header.startsWith('Bearer ')) {
    return fail(res, 401, 'UNAUTHORIZED', 'Token tidak ditemukan. Silakan masuk kembali.')
  }

  const token = header.slice('Bearer '.length).trim()
  if (!token) {
    return fail(res, 401, 'UNAUTHORIZED', 'Token kosong. Silakan masuk kembali.')
  }

  try {
    const payload = verifyToken(token)
    req.user = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
      nama: payload.nama,
    }
    return next()
  } catch (error) {
    const message =
      error?.name === 'TokenExpiredError'
        ? 'Sesi Anda sudah berakhir. Silakan masuk kembali.'
        : 'Token tidak valid. Silakan masuk kembali.'
    return fail(res, 401, 'UNAUTHORIZED', message)
  }
}

export default requireAuth
