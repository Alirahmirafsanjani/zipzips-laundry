import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'

export async function list({ includeInactive = true, role } = {}) {
  const services = await prisma.service.findMany({
    where: includeInactive ? {} : { isAktif: true },
    orderBy: [{ isAktif: 'desc' }, { nama: 'asc' }],
  })

  // OPERATOR hanya perlu nama/satuan untuk mengenali pekerjaan; harga tetap
  // rahasia agar tidak bocor lewat response API.
  if (role !== 'OPERATOR') return services
  return services.map(({ hargaDefault, ...service }) => service)
}

export async function create(data, actor) {
  const exists = await prisma.service.findUnique({ where: { kode: data.kode } })
  if (exists) {
    throw HttpError.conflict('KODE_TAKEN', `Kode layanan "${data.kode}" sudah dipakai.`)
  }

  const service = await prisma.service.create({
    data: {
      kode: data.kode,
      nama: data.nama,
      satuan: data.satuan,
      hargaDefault: data.hargaDefault,
      estimasiHari: data.estimasiHari ?? 1,
      deskripsi: data.deskripsi || null,
    },
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'BUAT_LAYANAN',
    entitas: 'Service',
    entitasId: service.id,
    detail: {
      summary: `Membuat layanan ${service.nama}`,
      sesudah: { hargaDefault: service.hargaDefault },
    },
  })

  return service
}

export async function update(id, data, actor) {
  const before = await prisma.service.findUnique({ where: { id } })
  if (!before) throw HttpError.notFound('Layanan tidak ditemukan.')

  if (data.kode && data.kode !== before.kode) {
    const exists = await prisma.service.findUnique({ where: { kode: data.kode } })
    if (exists) {
      throw HttpError.conflict('KODE_TAKEN', `Kode layanan "${data.kode}" sudah dipakai.`)
    }
  }

  const service = await prisma.service.update({
    where: { id },
    data: {
      ...(data.kode !== undefined ? { kode: data.kode } : {}),
      ...(data.nama !== undefined ? { nama: data.nama } : {}),
      ...(data.satuan !== undefined ? { satuan: data.satuan } : {}),
      ...(data.hargaDefault !== undefined ? { hargaDefault: data.hargaDefault } : {}),
      ...(data.estimasiHari !== undefined ? { estimasiHari: data.estimasiHari } : {}),
      ...(data.deskripsi !== undefined ? { deskripsi: data.deskripsi || null } : {}),
      ...(data.isAktif !== undefined ? { isAktif: data.isAktif } : {}),
    },
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'UBAH_LAYANAN',
    entitas: 'Service',
    entitasId: id,
    detail: {
      summary: `Memperbarui layanan ${service.nama}`,
      sebelum: { hargaDefault: before.hargaDefault, isAktif: before.isAktif },
      sesudah: { hargaDefault: service.hargaDefault, isAktif: service.isAktif },
    },
  })

  return service
}

export async function archive(id, actor) {
  const service = await prisma.service.findUnique({ where: { id } })
  if (!service) throw HttpError.notFound('Layanan tidak ditemukan.')

  const updated = await prisma.service.update({ where: { id }, data: { isAktif: false } })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'ARSIP_LAYANAN',
    entitas: 'Service',
    entitasId: id,
    detail: { summary: `Mengarsipkan layanan ${service.nama}` },
  })

  return updated
}
