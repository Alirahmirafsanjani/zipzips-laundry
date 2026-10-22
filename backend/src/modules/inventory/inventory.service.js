import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'
import { serializableTransaction } from '../../lib/transaction.js'
import { wibRange } from '../../lib/wib.js'

/**
 * =============================================================================
 * MODEL STOK
 * =============================================================================
 * TIDAK ADA kolom `stok` yang dikurangi otomatis.
 * Stok = SUM(qty StockMovement) untuk produk tersebut (ledger).
 *
 * recort akhir (stokSebelum / stokSesudah) disimpan di setiap mutasi agar
 * selisih stok bisa ditelusuri tanpa menghitung ulang seluruh riwayat.
 * =============================================================================
 */

export async function listProduk({ search = '', includeInactive = true } = {}) {
  const where = {}
  if (!includeInactive) where.isAktif = true
  if (search) {
    where.OR = [
      { nama: { contains: search, mode: 'insensitive' } },
      { kode: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [products, movements] = await Promise.all([
    prisma.product.findMany({ where, orderBy: { nama: 'asc' } }),
    prisma.stockMovement.groupBy({
      by: ['productId'],
      _sum: { qty: true },
    }),
  ])

  const stokMap = new Map(movements.map((m) => [m.productId, m._sum.qty ?? 0]))

  return products.map((product) => {
    const stok = stokMap.get(product.id) ?? 0
    return {
      ...product,
      stok,
      stokMenipis: stok <= product.stokMinimum,
    }
  })
}

export async function createProduct(data, actor) {
  const exists = await prisma.product.findUnique({ where: { kode: data.kode } })
  if (exists) {
    throw HttpError.conflict('KODE_TAKEN', `Kode produk "${data.kode}" sudah dipakai.`)
  }

  const product = await prisma.product.create({
    data: {
      kode: data.kode,
      nama: data.nama,
      satuan: data.satuan,
      stokMinimum: data.stokMinimum ?? 0,
      hargaBeliTerakhir: data.hargaBeliTerakhir ?? null,
    },
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'BUAT_PRODUK',
    entitas: 'Product',
    entitasId: product.id,
    detail: { summary: `Menambah produk ${product.nama}` },
  })

  return product
}

export async function updateProduct(id, data, actor) {
  const before = await prisma.product.findUnique({ where: { id } })
  if (!before) throw HttpError.notFound('Produk tidak ditemukan.')

  if (data.kode && data.kode !== before.kode) {
    const exists = await prisma.product.findUnique({ where: { kode: data.kode } })
    if (exists) {
      throw HttpError.conflict('KODE_TAKEN', `Kode produk "${data.kode}" sudah dipakai.`)
    }
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(data.kode !== undefined ? { kode: data.kode } : {}),
      ...(data.nama !== undefined ? { nama: data.nama } : {}),
      ...(data.satuan !== undefined ? { satuan: data.satuan } : {}),
      ...(data.stokMinimum !== undefined ? { stokMinimum: data.stokMinimum } : {}),
      ...(data.hargaBeliTerakhir !== undefined
        ? { hargaBeliTerakhir: data.hargaBeliTerakhir ?? null }
        : {}),
      ...(data.isAktif !== undefined ? { isAktif: data.isAktif } : {}),
    },
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'UBAH_PRODUK',
    entitas: 'Product',
    entitasId: id,
    detail: { summary: `Memperbarui produk ${product.nama}`, sebelum: before, sesudah: product },
  })

  return product
}

/** Stok terkini satu produk. */
export async function stokSaatIni(productId) {
  const agregat = await prisma.stockMovement.aggregate({
    where: { productId },
    _sum: { qty: true },
  })
  return agregat._sum.qty ?? 0
}

export async function createMovement(input, actor) {
  const tanggal = input.tanggal ? new Date(`${input.tanggal}T00:00:00+07:00`) : new Date()

  const hasil = await serializableTransaction(prisma, async (tx) => {
    const product = await tx.product.findUnique({ where: { id: input.productId } })
    if (!product) throw HttpError.notFound('Produk tidak ditemukan.')

    const agregat = await tx.stockMovement.aggregate({
      where: { productId: input.productId },
      _sum: { qty: true },
    })
    const stokSebelum = agregat._sum.qty ?? 0

    let qty
    let stokSesudah

    if (input.tipe === 'MASUK') {
      qty = input.qty
      stokSesudah = stokSebelum + qty
    } else if (input.tipe === 'KELUAR') {
      qty = -input.qty
      stokSesudah = stokSebelum - input.qty
      if (stokSesudah < 0) {
        throw HttpError.unprocessable(
          'STOK_TIDAK_CUKUP',
          `Stok ${product.nama} tidak cukup. Tersedia ${stokSebelum} ${product.satuan}, diminta ${input.qty}.`,
        )
      }
    } else {
      // PENYESUAIAN — opname: kasir mencatat stok fisik hasil hitungan.
      stokSesudah = input.stokAkhir
      qty = stokSesudah - stokSebelum
      if (qty === 0) {
        throw HttpError.unprocessable(
          'TIDAK_ADA_SELISIH',
          'Stok fisik sama dengan stok sistem. Tidak ada mutasi yang perlu dicatat.',
        )
      }
    }

    const movement = await tx.stockMovement.create({
      data: {
        productId: input.productId,
        tipe: input.tipe,
        qty,
        stokSebelum,
        stokSesudah,
        tanggal,
        keterangan: input.keterangan || null,
        createdById: actor.id,
      },
    })

    return { movement, stokSebelum, stokSesudah }
  })

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'MUTASI_STOK',
    entitas: 'StockMovement',
    entitasId: hasil.movement.id,
    detail: {
      summary: `Mutasi stok ${input.tipe} ${hasil.movement.qty} → stok ${hasil.stokSesudah}`,
      stokSebelum: hasil.stokSebelum,
      stokSesudah: hasil.stokSesudah,
    },
  })

  return { ...hasil.movement, stokSaatIni: hasil.stokSesudah }
}

export async function listMovements(query) {
  const where = {}
  if (query.productId) where.productId = query.productId
  if (query.tipe) where.tipe = query.tipe
  if (query.dari || query.sampai) {
    where.tanggal = wibRange(query.dari || '1970-01-01', query.sampai || '2999-12-31')
  }

  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, kode: true, nama: true, satuan: true } },
        createdBy: { select: { id: true, nama: true } },
      },
      orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.stockMovement.count({ where }),
  ])

  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit) || 1,
    },
  }
}
