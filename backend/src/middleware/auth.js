import { fail } from '../lib/http.js'
import { verifyToken } from '../lib/token.js'
import { prisma } from '../lib/prisma.js'

/**
 * Wajib login. Token dibaca dari header `Authorization: Bearer <token>`.
 * Setiap request memverifikasi akun masih aktif agar akun yang dinonaktifkan
 * tidak bisa melanjutkan sesi meski token JWT masih berlaku.
 */
export async function requireAuth(req, res, next) {
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
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true, role: true, nama: true, aktif: true },
    })

    if (!user) {
      return fail(res, 401, 'UNAUTHORIZED', 'Pengguna tidak ditemukan. Silakan masuk kembali.')
    }

    if (!user.aktif) {
      return fail(res, 403, 'AKUN_NONAKTIF', 'Akun Anda dinonaktifkan. Silakan hubungi pemilik.')
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      nama: user.nama,
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
