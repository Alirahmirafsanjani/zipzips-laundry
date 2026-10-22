import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'
import { nextOrderSequence, formatOrderNumber } from '../../lib/order-no.js'
import { wibRange } from '../../lib/wib.js'
import { scrubOrder, scrubOrders } from '../../lib/visibility.js'

/**
 * Transisi status pengerjaan yang diizinkan.
 * DIAMBIL adalah status terminal (OWNER boleh membuka kembali untuk koreksi).
 */
const TRANSISI = {
  DITERIMA: ['PROSES', 'SELESAI'],
  PROSES: ['DITERIMA', 'SELESAI'],
  SELESAI: ['PROSES', 'DIAMBIL'],
  DIAMBIL: ['SELESAI'],
}

export const orderInclude = {
  items: { orderBy: { id: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
  statusHistory: {
    orderBy: { pada: 'asc' },
    include: { oleh: { select: { id: true, nama: true, username: true } } },
  },
  customer: { select: { id: true, kode: true, nama: true, noHp: true } },
  createdBy: { select: { id: true, nama: true, username: true } },
}

/** Sisa tagihan = total - totalDibayar. */
export function sisaTagihan(order) {
  return Math.max(0, order.total - order.totalDibayar)
}

/** Status pembayaran DITURUNKAN, tidak disimpan. */
export function statusPembayaran(order) {
  if (order.voidedAt) return 'VOID'
  if (order.totalDibayar <= 0) return 'BELUM_BAYAR'
  if (order.totalDibayar < order.total) return 'SEBAGIAN'
  return 'LUNAS'
}

export async function create(input, actor) {
  // --- 0. Idempotensi: jangan sampai retry offline membuat pesanan ganda ----
  if (input.clientRequestId) {
    const existing = await prisma.order.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: orderInclude,
    })
    if (existing) {
      return { order: existing, dibuatBaru: false }
    }
  }

  // --- 1. Master layanan ----------------------------------------------------
  const serviceIds = [...new Set(input.items.map((item) => item.serviceId))]
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } })

  if (services.length !== serviceIds.length) {
    throw HttpError.unprocessable(
      'LAYANAN_TIDAK_ADA',
      'Sebagian layanan yang dipilih tidak ditemukan.',
    )
  }
  const serviceMap = new Map(services.map((service) => [service.id, service]))

  // --- 2. Hitung harga DI SERVER (jangan percaya nominal dari klien) -------
  const items = input.items.map((item) => {
    const service = serviceMap.get(item.serviceId)

    if (!service.isAktif) {
      throw HttpError.unprocessable(
        'LAYANAN_NONAKTIF',
        `Layanan "${service.nama}" sedang diarsipkan dan tidak bisa dipakai.`,
      )
    }

    const hargaSatuan = item.hargaSatuan ?? service.hargaDefault
    if (hargaSatuan < 0) {
      throw HttpError.unprocessable('HARGA_NEGATIF', 'Harga satuan tidak boleh negatif.')
    }

    return {
      serviceId: service.id,
      namaService: service.nama,
      satuan: service.satuan,
      qty: item.qty,
      hargaSatuan,
      subtotal: hargaSatuan * item.qty,
      catatan: item.catatan || null,
    }
  })

  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
  const diskon = input.diskon ?? 0

  if (diskon > subtotal) {
    throw HttpError.unprocessable(
      'DISKON_TERLALU_BESAR',
      'Diskon tidak boleh lebih besar dari subtotal.',
    )
  }
  const total = subtotal - diskon

  // --- 3. Identitas pelanggan ------------------------------------------------
  let namaPelanggan = (input.namaPelanggan || '').trim() || 'Pelanggan Umum'
  let noHp = (input.noHp || '').trim() || null

  if (input.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: input.customerId } })
    if (!customer) {
      throw HttpError.unprocessable('PELANGGAN_TIDAK_ADA', 'Pelanggan tidak ditemukan.')
    }
    namaPelanggan = customer.nama
    noHp = customer.noHp || noHp
  }

  // --- 4. Estimasi selesai ---------------------------------------------------
  const estimasiHariMaks = Math.max(
    0,
    ...services.map((service) => service.estimasiHari || 0),
  )
  let estimasiSelesai = null
  if (input.estimasiSelesai) {
    const parsed = new Date(input.estimasiSelesai)
    if (Number.isNaN(parsed.getTime())) {
      throw HttpError.unprocessable('TANGGAL_INVALID', 'Estimasi selesai tidak valid.')
    }
    estimasiSelesai = parsed
  } else if (estimasiHariMaks > 0) {
    estimasiSelesai = new Date(Date.now() + estimasiHariMaks * 24 * 60 * 60 * 1000)
  }

  // --- 5. Simpan -------------------------------------------------------------
  const order = await prisma.$transaction(async (tx) => {
    if (input.clientRequestId) {
      const existing = await tx.order.findUnique({
        where: { clientRequestId: input.clientRequestId },
        include: orderInclude,
      })
      if (existing) return existing
    }

    const { dateStr, seq } = await nextOrderSequence(tx)
    const nomor = formatOrderNumber(dateStr, seq)

    return tx.order.create({
      data: {
        nomor,
        clientRequestId: input.clientRequestId || null,
        customerId: input.customerId || null,
        namaPelanggan,
        noHp,
        sumber: input.sumber || 'ONLINE',
        subtotal,
        diskon,
        total,
        estimasiSelesai,
        catatan: input.catatan || null,
        createdById: actor.id,
        items: { create: items },
        statusHistory: {
          create: {
            dari: null,
            ke: 'DITERIMA',
            olehId: actor.id,
            catatan: 'Pesanan diterima',
          },
        },
      },
      include: orderInclude,
    })
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'BUAT_PESANAN',
    entitas: 'Order',
    entitasId: order.id,
    detail: {
      summary: `Pesanan ${order.nomor} dibuat (${namaPelanggan})`,
      total,
    },
  })

  return { order, dibuatBaru: true }
}

export async function list(query, role) {
  const where = {}

  if (query.status) where.statusOrder = query.status
  if (query.customerId) where.customerId = query.customerId

  if (query.dari || query.sampai) {
    const dari = query.dari || '1970-01-01'
    const sampai = query.sampai || '2999-12-31'
    where.tanggalMasuk = wibRange(dari, sampai)
  }

  if (query.search) {
    where.OR = [
      { nomor: { contains: query.search, mode: 'insensitive' } },
      { namaPelanggan: { contains: query.search, mode: 'insensitive' } },
      { noHp: { contains: query.search, mode: 'insensitive' } },
    ]
  }

  if (query.includeVoided !== 'true') {
    where.voidedAt = null
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: true,
        customer: { select: { id: true, kode: true, nama: true } },
      },
      orderBy: [{ tanggalMasuk: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.order.count({ where }),
  ])

  return {
    items: scrubOrders(
      items.map((order) => ({
        ...order,
        sisaTagihan: sisaTagihan(order),
        statusPembayaran: statusPembayaran(order),
      })),
      role,
    ),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
    },
  }
}

export async function getById(id, role) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: orderInclude,
  })
  if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')

  return scrubOrder(
    {
      ...order,
      sisaTagihan: sisaTagihan(order),
      statusPembayaran: statusPembayaran(order),
    },
    role,
  )
}

export async function updateStatus(id, { statusOrder, catatan }, actor) {
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')
  if (order.voidedAt) {
    throw HttpError.conflict('PESANAN_VOID', 'Pesanan yang sudah dibatalkan tidak bisa diubah.')
  }

  if (order.statusOrder === statusOrder) {
    throw HttpError.conflict(
      'STATUS_SAMA',
      `Status pesanan sudah "${statusOrder}".`,
    )
  }

  const boleh = TRANSISI[order.statusOrder] || []
  const khususOwner = order.statusOrder === 'DIAMBIL' && statusOrder === 'SELESAI'

  if (!boleh.includes(statusOrder) && !(khususOwner && actor.role === 'OWNER')) {
    throw HttpError.unprocessable(
      'TRANSISI_INVALID',
      `Status tidak bisa diubah dari "${order.statusOrder}" ke "${statusOrder}".`,
    )
  }

  const now = new Date()
  const data = {
    statusOrder,
    ...(statusOrder === 'SELESAI' ? { tanggalSelesai: now } : {}),
    ...(statusOrder === 'DIAMBIL' ? { tanggalDiambil: now } : {}),
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({ where: { id }, data })
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        dari: order.statusOrder,
        ke: statusOrder,
        olehId: actor.id,
        catatan: catatan || null,
      },
    })
    return result
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'UBAH_STATUS_PESANAN',
    entitas: 'Order',
    entitasId: id,
    detail: {
      summary: `Status ${order.nomor}: ${order.statusOrder} → ${statusOrder}`,
    },
  })

  // Karangian boleh mengubah status, jadi hasilnya ikut dibersihkan dari
  // angka keuangan bila yang mengubah adalah OPERATOR.
  return getById(id, actor.role)
}

export async function voidOrder(id, alasan, actor) {
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')
  if (order.voidedAt) {
    throw HttpError.conflict('SUDAH_VOID', 'Pesanan ini sudah dibatalkan sebelumnya.')
  }

  const updated = await prisma.order.update({
    where: { id },
    data: {
      voidedAt: new Date(),
      voidedById: actor.id,
      voidAlasan: alasan,
    },
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'VOID_PESANAN',
    entitas: 'Order',
    entitasId: id,
    detail: {
      summary: `Membatalkan pesanan ${order.nomor}`,
      alasan,
      total: order.total,
      totalDibayar: order.totalDibayar,
    },
  })

  return getById(id)
}

export async function updateNotes(id, { catatan, catatanPengerjaan }, actor) {
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')

  const updated = await prisma.order.update({
    where: { id },
    data: {
      ...(catatan !== undefined ? { catatan: catatan || null } : {}),
      ...(catatanPengerjaan !== undefined
        ? { catatanPengerjaan: catatanPengerjaan || null }
        : {}),
    },
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'UBAH_CATATAN_PESANAN',
    entitas: 'Order',
    entitasId: id,
    detail: { summary: `Memperbarui catatan pesanan ${order.nomor}` },
  })

  return updated
}
