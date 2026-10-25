import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'
import { nextOrderSequence, formatOrderNumber } from '../../lib/order-no.js'
import { todayWib, wibRange } from '../../lib/wib.js'
import { scrubOrder, scrubOrders } from '../../lib/visibility.js'
import { sisaTagihan, statusPembayaran } from '../../lib/order-status.js'
import { serializableTransaction } from '../../lib/transaction.js'
import { catatPembayaran } from '../payments/payments.core.js'

// Tetap diekspor dari sini agar modul lama (dan test) tidak perlu diubah.
export { sisaTagihan, statusPembayaran }

/**
 * Transisi status pengerjaan yang diizinkan.
 *
 * Alur operasional bersifat linear: DITERIMA → PROSES → SELESAI → DIAMBIL.
 * Lompatan (mis. DITERIMA → DIAMBIL) ditolak agar cucian tidak mungkin
 * diserahkan tanpa melewati pencucian dan konfirmasi selesai.
 *
 * Perubahan ke DIAMBIL TIDAK lewat endpoint status biasa. Serah terima wajib
 * memakai `serahkan` agar pembayaran/piutang, tanggal pengambilan, dan audit
 * tercatat dalam satu transaksi. Dengan begitu operator tidak bisa "menandai
 * diambil" dan melewati pencatatan uang.
 */
const TRANSISI = {
  DITERIMA: ['PROSES'],
  PROSES: ['SELESAI'],
  SELESAI: [],
  DIAMBIL: [],
}

/**
 * Koreksi mundur HANYA untuk OWNER (mis. salah klik "Selesai").
 * Operator/kasir tidak boleh memundurkan status.
 */
const KOREKSI_OWNER = {
  PROSES: 'DITERIMA',
  SELESAI: 'PROSES',
  DIAMBIL: 'SELESAI',
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
  dihubungiOleh: { select: { id: true, nama: true } },
}

/** Sisa tagihan & status pembayaran kini berasal dari lib/order-status.js. */

/**
 * Prisma mengembalikan Decimal untuk `qty`. Ubah ke number agar JSON bersih
 * dan frontend tidak perlu mem-parsing string desimal.
 */
function rapikanOrder(order) {
  if (!order) return order
  return {
    ...order,
    ...(Array.isArray(order.items)
      ? { items: order.items.map((item) => ({ ...item, qty: Number(item.qty) })) }
      : {}),
  }
}

export async function create(input, actor) {
  // --- 0. Idempotensi: jangan sampai retry offline membuat pesanan ganda ----
  if (input.clientRequestId) {
    const existing = await prisma.order.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: orderInclude,
    })
    if (existing) {
      return {
        order: {
          ...rapikanOrder(existing),
          sisaTagihan: sisaTagihan(existing),
          statusPembayaran: statusPembayaran(existing),
        },
        dibuatBaru: false,
      }
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

    const qty = Number(item.qty)
    if (!Number.isFinite(qty) || qty <= 0) {
      throw HttpError.unprocessable('QTY_INVALID', 'Jumlah harus lebih dari nol.')
    }
    // Cuci satuan tidak masuk akal setengah item; kiloan justru butuh desimal.
    if (service.satuan === 'ITEM' && !Number.isInteger(qty)) {
      throw HttpError.unprocessable(
        'QTY_HARUS_BULAT',
        `Layanan "${service.nama}" memakai satuan item, jumlah harus bilangan bulat.`,
      )
    }
    if (Math.abs(qty * 100 - Math.round(qty * 100)) > 1e-9) {
      throw HttpError.unprocessable(
        'QTY_TERLALU_PRESISI',
        'Jumlah maksimal 2 angka desimal (mis. 2,75 kg).',
      )
    }

    const hargaSatuan = item.hargaSatuan ?? service.hargaDefault
    if (hargaSatuan < 0) {
      throw HttpError.unprocessable('HARGA_NEGATIF', 'Harga satuan tidak boleh negatif.')
    }
    // Kasir boleh memberi harga lebih rendah (diskon), tetapi tidak boleh
    // menaikkan di atas master. Tanpa aturan server ini, override harga di
    // layar bisa dipakai untuk mengenakan tarif yang tidak disetujui pemilik.
    if (hargaSatuan > service.hargaDefault) {
      throw HttpError.unprocessable(
        'HARGA_MELEBIHI_MASTER',
        `Harga "${service.nama}" tidak boleh melebihi harga master ` +
          `(${service.hargaDefault}).`,
      )
    }

    return {
      serviceId: service.id,
      namaService: service.nama,
      satuan: service.satuan,
      qty,
      hargaSatuan,
      // Total rupiah selalu bilangan bulat penuh.
      subtotal: Math.round(hargaSatuan * qty),
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
  const { order, dibuatBaru } = await prisma.$transaction(async (tx) => {
    if (input.clientRequestId) {
      const existing = await tx.order.findUnique({
        where: { clientRequestId: input.clientRequestId },
        include: orderInclude,
      })
      // Retry dari klien: kembalikan pesanan yang sama, jangan buat baru.
      if (existing) return { order: existing, dibuatBaru: false }
    }

    const { dateStr, seq } = await nextOrderSequence(tx)
    const nomor = formatOrderNumber(dateStr, seq)

    const created = await tx.order.create({
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

    return { order: created, dibuatBaru: true }
  })

  // Retry idempoten tidak boleh menulis audit "dibuat" dua kali.
  if (dibuatBaru) {
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
  }

  return {
    order: {
      ...rapikanOrder(order),
      sisaTagihan: sisaTagihan(order),
      statusPembayaran: statusPembayaran(order),
    },
    dibuatBaru,
  }
}

export async function list(query, role) {
  const where = {}

  if (query.status) where.statusOrder = query.status
  if (query.customerId) where.customerId = query.customerId

  if (query.belumDihubungi === 'true') {
    where.statusOrder = 'SELESAI'
    where.dihubungiAt = null
  }

  if (query.jatuhTempo === 'true') {
    // Perbandingan antar-kolom (totalDibayar < total) tidak didukung filter
    // Prisma biasa, jadi ambil ID piutang yang benar-benar belum lunas.
    const rows = await prisma.$queryRaw`
      SELECT id FROM "orders"
      WHERE "voidedAt" IS NULL
        AND "jatuhTempo" IS NOT NULL
        AND "jatuhTempo" <= ${new Date()}
        AND "totalDibayar" < "total"
    `
    where.id = { in: rows.map((row) => row.id) }
  }

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
        ...rapikanOrder(order),
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
      ...rapikanOrder(order),
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
  const koreksiOwner = KOREKSI_OWNER[order.statusOrder] === statusOrder && actor.role === 'OWNER'

  if (!boleh.includes(statusOrder) && !koreksiOwner) {
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
    // Koreksi mundur membersihkan jejak waktu yang tidak lagi berlaku.
    // Cucian yang dikerjakan ulang harus dikabari lagi saat selesai, jadi
    // status kontak juga direset (jumlah kontak tetap sebagai riwayat).
    ...(order.statusOrder === 'SELESAI' && statusOrder === 'PROSES'
      ? {
          tanggalSelesai: null,
          dihubungiAt: null,
          dihubungiVia: null,
          dihubungiOlehId: null,
        }
      : {}),
    ...(order.statusOrder === 'DIAMBIL' && statusOrder === 'SELESAI'
      ? { tanggalDiambil: null }
      : {}),
  }

  await prisma.$transaction(async (tx) => {
    // Compare-and-set: dua pengguna yang menekan tombol bersamaan tidak boleh
    // sama-sama menulis riwayat dari status lama yang sama.
    const result = await tx.order.updateMany({
      where: { id, statusOrder: order.statusOrder, voidedAt: null },
      data,
    })
    if (result.count === 0) {
      throw HttpError.conflict(
        'STATUS_BERUBAH',
        'Status pesanan sudah berubah. Muat ulang halaman lalu coba lagi.',
      )
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        dari: order.statusOrder,
        ke: statusOrder,
        olehId: actor.id,
        catatan: catatan || null,
      },
    })
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

export async function voidOrder(id, { alasan, refund }, actor) {
  await serializableTransaction(prisma, async (tx) => {
    const order = await tx.order.findUnique({ where: { id } })
    if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')
    if (order.voidedAt) {
      throw HttpError.conflict('SUDAH_VOID', 'Pesanan ini sudah dibatalkan sebelumnya.')
    }

    /**
     * Uang yang sudah diterima tidak boleh "hilang" hanya karena pesanan
     * dibatalkan. Bila ada pembayaran, OWNER wajib memutuskan refund —
     * termasuk memilih nominal 0 bila uang memang tidak dikembalikan.
     */
    if (order.totalDibayar > 0 && !refund) {
      throw HttpError.unprocessable(
        'REFUND_WAJIB_DIPUTUSKAN',
        'Pesanan ini sudah menerima pembayaran. Tentukan nominal refund ' +
          '(isi 0 bila uang tidak dikembalikan) sebelum membatalkan.',
      )
    }

    const nominalRefund = refund?.nominal ?? 0
    if (nominalRefund > order.totalDibayar) {
      throw HttpError.unprocessable(
        'REFUND_MELEBIHI_PEMBAYARAN',
        `Nominal refund tidak boleh melebihi total pembayaran (${order.totalDibayar}).`,
      )
    }

    const now = new Date()
    const update = await tx.order.updateMany({
      where: { id, voidedAt: null },
      data: {
        voidedAt: now,
        voidedById: actor.id,
        voidAlasan: alasan,
      },
    })
    if (update.count === 0) {
      throw HttpError.conflict('SUDAH_VOID', 'Pesanan ini sudah dibatalkan sebelumnya.')
    }

    let expense = null
    if (nominalRefund > 0) {
      expense = await tx.expense.create({
        data: {
          tanggal: now,
          kategori: 'REFUND',
          keterangan:
            refund.keterangan?.trim() || `Refund pembatalan pesanan ${order.nomor}`,
          nominal: nominalRefund,
          metodeBayar: refund.metodeBayar,
          refType: 'ORDER_REFUND',
          refId: order.id,
          createdById: actor.id,
        },
      })
    }

    await writeAudit(tx, {
      userId: actor.id,
      aksi: 'VOID_PESANAN',
      entitas: 'Order',
      entitasId: id,
      detail: {
        summary: `Membatalkan pesanan ${order.nomor}`,
        alasan,
        total: order.total,
        totalDibayar: order.totalDibayar,
        refund: refund
          ? {
              nominal: nominalRefund,
              metodeBayar: refund.metodeBayar,
              expenseId: expense?.id ?? null,
            }
          : null,
      },
    })

    return { expenseId: expense?.id ?? null, nominalRefund }
  })

  return getById(id, actor.role)
}

/**
 * Mencatat bahwa admin sudah menghubungi pelanggan.
 *
 * Hanya boleh setelah cucian SELESAI — inilah momen pelanggan perlu diberi
 * tahu agar datang mengambil. Setiap kontak menambah `jumlahDihubungi`
 * sehingga terlihat bila pelanggan perlu dihubungi ulang.
 */
export async function hubungi(id, { via, catatan }, actor) {
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')
  if (order.voidedAt) {
    throw HttpError.conflict('PESANAN_VOID', 'Pesanan yang dibatalkan tidak perlu dihubungi.')
  }
  if (order.statusOrder !== 'SELESAI') {
    throw HttpError.unprocessable(
      'BELUM_SELESAI',
      'Pelanggan dihubungi setelah cucian selesai (status SELESAI).',
    )
  }
  if (via === 'WHATSAPP' && !order.noHp) {
    throw HttpError.unprocessable(
      'NO_HP_KOSONG',
      'Nomor HP pelanggan belum diisi. Lengkapi dulu atau hubungi lewat telepon.',
    )
  }

  const result = await prisma.order.updateMany({
    where: { id, statusOrder: 'SELESAI', voidedAt: null },
    data: {
      dihubungiAt: new Date(),
      dihubungiVia: via,
      dihubungiOlehId: actor.id,
      jumlahDihubungi: { increment: 1 },
    },
  })
  if (result.count === 0) {
    throw HttpError.conflict(
      'STATUS_BERUBAH',
      'Status pesanan sudah berubah. Muat ulang halaman lalu coba lagi.',
    )
  }

  await writeAudit(prisma, {
    userId: actor.id,
    aksi: 'HUBUNGI_PELANGGAN',
    entitas: 'Order',
    entitasId: id,
    detail: {
      summary: `Menghubungi ${order.namaPelanggan} untuk pesanan ${order.nomor} via ${via}`,
      ...(catatan ? { catatan } : {}),
    },
  })

  return getById(id, actor.role)
}

/**
 * Serah terima cucian kepada pelanggan.
 *
 * Menggabungkan dua aksi yang di lapangan terjadi bersamaan:
 *   1. mencatat pembayaran (opsional — boleh lunas, DP, atau belum bayar), dan
 *   2. mengubah status menjadi DIAMBIL.
 *
 * Keduanya berjalan dalam SATU transaksi SERIALIZABLE. Jadi mustahil ada
 * pembayaran tercatat tetapi status tidak berpindah, atau sebaliknya.
 * `idempotencyKey` membuat klik ganda aman: request ulang mengembalikan
 * hasil yang sama tanpa menambah pembayaran.
 */
export async function serahkan(id, input, actor) {
  const hasil = await serializableTransaction(prisma, async (tx) => {
    const order = await tx.order.findUnique({ where: { id } })
    if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')
    if (order.voidedAt) {
      throw HttpError.conflict('PESANAN_VOID', 'Pesanan yang dibatalkan tidak bisa diserahkan.')
    }

    // Retry aman: bila pembayaran dengan key ini sudah pernah dibuat,
    // jangan mencatat pembayaran baru.
    const idempotencyKey = input.pembayaran?.idempotencyKey
    let payment = null
    let dibuatBaru = false
    let totalDibayarSetelah = order.totalDibayar

    let jatuhTempo = null
    if (input.jatuhTempo) {
      if (input.jatuhTempo < todayWib()) {
        throw HttpError.unprocessable(
          'JATUH_TEMPO_LAMPAU',
          'Tanggal janji bayar tidak boleh di masa lalu.',
        )
      }
      const parsed = new Date(`${input.jatuhTempo}T00:00:00+07:00`)
      if (Number.isNaN(parsed.getTime())) {
        throw HttpError.unprocessable('TANGGAL_INVALID', 'Tanggal jatuh tempo tidak valid.')
      }
      jatuhTempo = parsed
    }

    if (idempotencyKey) {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey },
        include: { order: true },
      })
      if (existing) {
        // Key yang sama tidak boleh dipakai untuk pesanan lain. Tanpa cek ini,
        // respons bisa "sukses" untuk pesanan yang salah.
        if (existing.orderId !== id) {
          throw HttpError.conflict(
            'IDEMPOTENCY_KEY_BENTROK',
            'Kunci idempotensi sudah dipakai pesanan lain. Muat ulang halaman lalu coba lagi.',
          )
        }
        // Retry murni setelah serah terima berhasil.
        if (order.statusOrder === 'DIAMBIL') {
          return {
            order: existing.order,
            payment: existing,
            dibuatBaru: false,
            statusBerubah: false,
          }
        }
        // Pembayaran sudah tercatat tetapi status belum berpindah
        // (mis. key dipakai ulang dari pembayaran DP): lanjutkan serah terima.
        payment = existing
        totalDibayarSetelah = existing.order.totalDibayar
      }
    }

    if (order.statusOrder === 'DIAMBIL') {
      throw HttpError.conflict('SUDAH_DIAMBIL', 'Pesanan ini sudah diserahkan sebelumnya.')
    }
    if (order.statusOrder !== 'SELESAI') {
      throw HttpError.unprocessable(
        'BELUM_SELESAI',
        'Pesanan hanya bisa diserahkan setelah status SELESAI.',
      )
    }

    if (input.pembayaran && !payment) {
      const hasilBayar = await catatPembayaran(tx, order, input.pembayaran, actor)
      payment = hasilBayar.payment
      dibuatBaru = hasilBayar.dibuatBaru
      totalDibayarSetelah = hasilBayar.order.totalDibayar
    }

    // Jatuh tempo hanya disimpan bila benar-benar masih ada sisa tagihan.
    const sisaSetelah = Math.max(0, order.total - totalDibayarSetelah)
    const updated = await tx.order.update({
      where: { id },
      data: {
        statusOrder: 'DIAMBIL',
        tanggalDiambil: new Date(),
        // Selalu tulis ulang: sisa 0 harus menghapus janji bayar lama yang
        // mungkin tertinggal saat OWNER mengoreksi status dan menyerahkan ulang.
        jatuhTempo: sisaSetelah > 0 ? jatuhTempo : null,
      },
    })

    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        dari: 'SELESAI',
        ke: 'DIAMBIL',
        olehId: actor.id,
        catatan:
          input.catatan ||
          (payment ? 'Cucian diserahkan dan pembayaran dicatat' : 'Cucian diserahkan ke pelanggan'),
      },
    })

    return { order: updated, payment, dibuatBaru, statusBerubah: true }
  })

  if (hasil.statusBerubah) {
    await writeAudit(prisma, {
      userId: actor.id,
      aksi: 'SERAHKAN_PESANAN',
      entitas: 'Order',
      entitasId: id,
      detail: {
        summary: `Pesanan ${hasil.order.nomor} diserahkan ke pelanggan`,
        totalDibayar: hasil.order.totalDibayar,
        ...(hasil.payment
          ? { metode: hasil.payment.metode, nominal: hasil.payment.nominal }
          : {}),
      },
    })
  }

  return {
    order: await getById(id, actor.role),
    payment: hasil.payment,
    dibuatBaru: hasil.dibuatBaru,
  }
}

export async function updateNotes(id, { catatan, catatanPengerjaan }, actor) {
  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) throw HttpError.notFound('Pesanan tidak ditemukan.')

  // OPERATOR hanya boleh mengisi catatan pengerjaan. Catatan pelanggan
  // (mis. instruksi khusus dari kasir) tetap milik OWNER/KASIR.
  if (actor.role === 'OPERATOR' && catatan !== undefined) {
    throw HttpError.forbidden('Operator hanya boleh mengubah catatan pengerjaan.')
  }

  await prisma.order.update({
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

  // Kembalikan pesanan lengkap (dengan field turunan) dan tetap scrub angka
  // keuangan bila yang menyimpan adalah OPERATOR.
  return getById(id, actor.role)
}
