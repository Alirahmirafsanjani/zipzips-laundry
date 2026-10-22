import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { signToken, tokenPayload } from '../../lib/token.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'

const SALT_ROUNDS = 10

/**
 * Hash bcrypt dari password sembarang, dipakai hanya agar waktu respons login
 * tetap seragam saat username tidak ditemukan (mitigasi enumerasi akun).
 */
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function login({ username, password }) {
  const user = await prisma.user.findUnique({ where: { username } })

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH)
    throw HttpError.unauthorized('Username atau kata sandi salah.')
  }

  if (!user.aktif) {
    throw HttpError.forbidden('Akun Anda dinonaktifkan. Silakan hubungi pemilik.')
  }

  const cocok = await bcrypt.compare(password, user.passwordHash)
  if (!cocok) {
    await writeAudit(prisma, {
      userId: user.id,
      aksi: 'LOGIN_GAGAL',
      entitas: 'User',
      entitasId: user.id,
      detail: { summary: 'Percobaan login gagal' },
    })
    throw HttpError.unauthorized('Username atau kata sandi salah.')
  }

  const token = signToken(user)

  await writeAudit(prisma, {
    userId: user.id,
    aksi: 'LOGIN',
    entitas: 'User',
    entitasId: user.id,
    detail: { summary: 'Login berhasil' },
  })

  return { token, user: tokenPayload(user) }
}

export async function me(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw HttpError.unauthorized('Pengguna tidak ditemukan.')
  if (!user.aktif) throw HttpError.forbidden('Akun Anda dinonaktifkan.')
  return tokenPayload(user)
}

export async function changePassword({ userId, passwordLama, passwordBaru }) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw HttpError.notFound('Pengguna tidak ditemukan.')

  const cocok = await bcrypt.compare(passwordLama, user.passwordHash)
  if (!cocok) {
    throw HttpError.badRequest('Kata sandi lama tidak cocok.')
  }

  if (passwordLama === passwordBaru) {
    throw HttpError.badRequest('Kata sandi baru harus berbeda dari kata sandi lama.')
  }

  const passwordHash = await hashPassword(passwordBaru)
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } })

  await writeAudit(prisma, {
    userId,
    aksi: 'UBAH_PASSWORD',
    entitas: 'User',
    entitasId: userId,
    detail: { summary: 'Pengguna mengganti kata sandi sendiri' },
  })

  return { message: 'Kata sandi berhasil diubah.' }
}
