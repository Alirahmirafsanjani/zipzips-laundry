import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'
import { hashPassword } from '../auth/auth.service.js'

const publicSelect = {
  id: true,
  nama: true,
  username: true,
  role: true,
  noHp: true,
  aktif: true,
  createdAt: true,
  updatedAt: true,
}

export async function list({ search = '', includeInactive = true } = {}) {
  const where = {}
  if (!includeInactive) where.aktif = true
  if (search) {
    where.OR = [
      { nama: { contains: search, mode: 'insensitive' } },
      { username: { contains: search, mode: 'insensitive' } },
    ]
  }

  const users = await prisma.user.findMany({
    where,
    select: publicSelect,
    orderBy: [{ aktif: 'desc' }, { nama: 'asc' }],
  })

  return users
}

export async function create({ nama, username, password, role, noHp }, actor) {
  const exists = await prisma.user.findUnique({ where: { username } })
  if (exists) {
    throw HttpError.conflict('USERNAME_TAKEN', `Username "${username}" sudah dipakai.`)
  }

  const passwordHash = await hashPassword(password)

  const user = await prisma.user.create({
    data: {
      nama,
      username,
      passwordHash,
      role,
      noHp: noHp || null,
    },
    select: publicSelect,
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'BUAT_USER',
    entitas: 'User',
    entitasId: user.id,
    detail: { summary: `Membuat pengguna ${username} (${role})` },
  })

  return user
}

export async function update(id, data, actor) {
  const before = await prisma.user.findUnique({ where: { id }, select: publicSelect })
  if (!before) throw HttpError.notFound('Pengguna tidak ditemukan.')

  // Jangan biarkan pemilik terakhir kehilangan aksesnya sendiri.
  if (before.role === 'OWNER' && (data.role && data.role !== 'OWNER' || data.aktif === false)) {
    const jumlahOwner = await prisma.user.count({ where: { role: 'OWNER', aktif: true } })
    if (jumlahOwner <= 1) {
      throw HttpError.conflict(
        'OWNER_TERAKHIR',
        'Tidak bisa mengubah peran/status pemilik aktif terakhir.',
      )
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(data.nama !== undefined ? { nama: data.nama } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.noHp !== undefined ? { noHp: data.noHp || null } : {}),
      ...(data.aktif !== undefined ? { aktif: data.aktif } : {}),
    },
    select: publicSelect,
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'UBAH_USER',
    entitas: 'User',
    entitasId: id,
    detail: { summary: `Memperbarui pengguna ${user.username}`, sebelum: before, sesudah: user },
  })

  return user
}

export async function resetPassword(id, password, actor) {
  const target = await prisma.user.findUnique({ where: { id }, select: publicSelect })
  if (!target) throw HttpError.notFound('Pengguna tidak ditemukan.')

  const passwordHash = await hashPassword(password)
  await prisma.user.update({ where: { id }, data: { passwordHash } })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'RESET_PASSWORD',
    entitas: 'User',
    entitasId: id,
    detail: { summary: `Reset kata sandi pengguna ${target.username}` },
  })

  return { message: `Kata sandi ${target.username} berhasil direset.` }
}
