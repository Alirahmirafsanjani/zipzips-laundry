import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'

const select = {
  id: true,
  kode: true,
  nama: true,
  noHp: true,
  alamat: true,
  catatan: true,
  createdAt: true,
  updatedAt: true,
}

/** Kode pelanggan berurutan: C001, C002, ... */
async function nextCustomerCode(tx) {
  const key = 'customer'
  const counter = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  })
  return `C${String(counter.value).padStart(4, '0')}`
}

export async function list({ search = '', page = 1, limit = 20 } = {}) {
  const where = {}
  if (search) {
    where.OR = [
      { nama: { contains: search, mode: 'insensitive' } },
      { noHp: { contains: search, mode: 'insensitive' } },
      { kode: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
  ])

  return {
    items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  }
}

export async function getById(id) {
  const customer = await prisma.customer.findUnique({ where: { id }, select })
  if (!customer) throw HttpError.notFound('Pelanggan tidak ditemukan.')

  const orders = await prisma.order.findMany({
    where: { customerId: id },
    select: {
      id: true,
      nomor: true,
      statusOrder: true,
      total: true,
      totalDibayar: true,
      tanggalMasuk: true,
    },
    orderBy: { tanggalMasuk: 'desc' },
    take: 20,
  })

  const agregat = await prisma.order.aggregate({
    where: { customerId: id, voidedAt: null },
    _sum: { total: true },
    _count: { _all: true },
  })

  return {
    ...customer,
    ringkasan: {
      jumlahPesanan: agregat._count._all,
      totalOmzet: agregat._sum.total ?? 0,
    },
    pesananTerbaru: orders,
  }
}

export async function create(data, actor) {
  const customer = await prisma.$transaction(async (tx) => {
    const kode = await nextCustomerCode(tx)
    return tx.customer.create({
      data: {
        kode,
        nama: data.nama,
        noHp: data.noHp || null,
        alamat: data.alamat || null,
        catatan: data.catatan || null,
      },
      select,
    })
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'BUAT_PELANGGAN',
    entitas: 'Customer',
    entitasId: customer.id,
    detail: { summary: `Menambah pelanggan ${customer.nama}` },
  })

  return customer
}

export async function update(id, data, actor) {
  const before = await prisma.customer.findUnique({ where: { id }, select })
  if (!before) throw HttpError.notFound('Pelanggan tidak ditemukan.')

  const customer = await prisma.customer.update({
    where: { id },
    data: {
      ...(data.nama !== undefined ? { nama: data.nama } : {}),
      ...(data.noHp !== undefined ? { noHp: data.noHp || null } : {}),
      ...(data.alamat !== undefined ? { alamat: data.alamat || null } : {}),
      ...(data.catatan !== undefined ? { catatan: data.catatan || null } : {}),
    },
    select,
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'UBAH_PELANGGAN',
    entitas: 'Customer',
    entitasId: id,
    detail: { summary: `Memperbarui pelanggan ${customer.nama}`, sebelum: before, sesudah: customer },
  })

  return customer
}
