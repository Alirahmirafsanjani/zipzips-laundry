import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { resetDatabase, loginAs, buatPesanan, inject } from './helpers.js'

const app = createApp()

/**
 * Menguji alur nyata di lapangan:
 *   pesanan masuk → dicuci → SELESAI → pelanggan dihubungi → diambil & dibayar.
 */
describe('Alur serah terima & hubungi pelanggan', () => {
  let headers
  let services

  beforeEach(async () => {
    const data = await resetDatabase()
    services = data.services
    headers = (await loginAs(app, 'kasir')).headers
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function ubahStatus(order, statusOrder) {
    const response = await inject(app, {
      method: 'PATCH',
      url: `/api/orders/${order.id}/status`,
      headers,
      payload: { statusOrder },
    })
    expect(response.statusCode).toBe(200)
    return response.json().data
  }

  async function siapDiambil(order) {
    await ubahStatus(order, 'PROSES')
    await ubahStatus(order, 'SELESAI')
  }

  it('menerima berat kiloan desimal (2,5 kg) dan menghitung total dengan benar', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2.5,
    })

    expect(order.items[0].qty).toBe(2.5)
    expect(order.items[0].subtotal).toBe(17500) // 2,5 × 7000
    expect(order.total).toBe(17500)
  })

  it('menolak jumlah desimal untuk layanan satuan (ITEM)', async () => {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/orders',
      headers,
      payload: {
        items: [{ serviceId: services.satuan.id, qty: 1.5 }],
      },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('QTY_HARUS_BULAT')
  })

  it('menolak lompatan status DITERIMA → SELESAI (harus melalui PROSES)', async () => {
    const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

    const response = await inject(app, {
      method: 'PATCH',
      url: `/api/orders/${order.id}/status`,
      headers,
      payload: { statusOrder: 'SELESAI' },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('TRANSISI_INVALID')
  })

  it('hanya boleh menghubungi pelanggan setelah status SELESAI', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      noHp: '081234567890',
    })

    const terlaluAwal = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/hubungi`,
      headers,
      payload: { via: 'WHATSAPP' },
    })
    expect(terlaluAwal.statusCode).toBe(422)
    expect(terlaluAwal.json().error.code).toBe('BELUM_SELESAI')

    await siapDiambil(order)

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/hubungi`,
      headers,
      payload: { via: 'WHATSAPP', catatan: 'Pesan siap diambil dikirim' },
    })

    expect(response.statusCode).toBe(200)
    const data = response.json().data
    expect(data.dihubungiAt).toBeTruthy()
    expect(data.dihubungiVia).toBe('WHATSAPP')
    expect(data.jumlahDihubungi).toBe(1)
    expect(data.dihubungiOleh?.nama).toBe('Kasir Uji')
  })

  it('menolak hubungi via WhatsApp bila nomor HP kosong', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      noHp: null,
    })
    await siapDiambil(order)

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/hubungi`,
      headers,
      payload: { via: 'WHATSAPP' },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('NO_HP_KOSONG')
  })

  it('menolak serah terima sebelum cucian selesai', async () => {
    const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: {},
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('BELUM_SELESAI')
  })

  it('serah terima + pembayaran lunas dalam satu langkah (status DIAMBIL)', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    }) // total 14000
    await siapDiambil(order)

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: {
        pembayaran: {
          metode: 'TUNAI',
          nominal: 20000,
          idempotencyKey: 'serah-terima-uji-001',
        },
        catatan: 'Diambil pelanggan',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json().data
    expect(body.order.statusOrder).toBe('DIAMBIL')
    expect(body.order.tanggalDiambil).toBeTruthy()
    expect(body.order.totalDibayar).toBe(14000)
    expect(body.order.statusPembayaran).toBe('LUNAS')
    expect(body.order.sisaTagihan).toBe(0)
    expect(body.payment.kembalian).toBe(6000)
    expect(body.dibuatBaru).toBe(true)

    const riwayat = body.order.statusHistory
    expect(riwayat[riwayat.length - 1].ke).toBe('DIAMBIL')

    // Klik ganda / retry jaringan tidak menambah pembayaran atau riwayat.
    const ulang = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: {
        pembayaran: {
          metode: 'TUNAI',
          nominal: 20000,
          idempotencyKey: 'serah-terima-uji-001',
        },
      },
    })
    expect(ulang.statusCode).toBe(200)
    expect(ulang.json().data.dibuatBaru).toBe(false)
    expect(await prisma.payment.count()).toBe(1)
    expect(await prisma.orderStatusHistory.count({ where: { ke: 'DIAMBIL' } })).toBe(1)
  })

  it('serah terima tanpa pembayaran tetap boleh, sisa menjadi piutang', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })
    await siapDiambil(order)

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: { catatan: 'Diambil, bayar minggu depan' },
    })

    expect(response.statusCode).toBe(200)
    const data = response.json().data
    expect(data.order.statusOrder).toBe('DIAMBIL')
    expect(data.order.statusPembayaran).toBe('BELUM_BAYAR')
    expect(data.order.sisaTagihan).toBe(14000)
    expect(data.payment).toBeNull()
  })

  it('retry clientRequestId mengembalikan pesanan sama dan dibuatBaru=false', async () => {
    const payload = {
      items: [{ serviceId: services.kiloan.id, qty: 2 }],
      clientRequestId: 'uji-retry-pesanan-0001',
    }

    const pertama = await inject(app, {
      method: 'POST',
      url: '/api/orders',
      headers,
      payload,
    })
    const kedua = await inject(app, {
      method: 'POST',
      url: '/api/orders',
      headers,
      payload,
    })

    expect(pertama.statusCode).toBe(201)
    expect(pertama.json().meta.dibuatBaru).toBe(true)
    expect(kedua.statusCode).toBe(201)
    expect(kedua.json().meta.dibuatBaru).toBe(false)
    expect(kedua.json().data.id).toBe(pertama.json().data.id)
    expect(await prisma.order.count()).toBe(1)
    // Audit pembuatan tidak boleh dobel hanya karena retry.
    expect(await prisma.auditLog.count({ where: { aksi: 'BUAT_PESANAN' } })).toBe(1)
  })

  it('menolak idempotencyKey pembayaran yang sudah dipakai pesanan lain', async () => {
    const orderA = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })
    const orderB = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })

    const key = 'pembayaran-key-bentrok-001'
    const pertama = await inject(app, {
      method: 'POST',
      url: `/api/orders/${orderA.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 5000, idempotencyKey: key },
    })
    expect(pertama.statusCode).toBe(201)

    const kedua = await inject(app, {
      method: 'POST',
      url: `/api/orders/${orderB.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 5000, idempotencyKey: key },
    })
    expect(kedua.statusCode).toBe(409)
    expect(kedua.json().error.code).toBe('IDEMPOTENCY_KEY_BENTROK')

    const masih = await prisma.order.findUnique({ where: { id: orderB.id } })
    expect(masih.totalDibayar).toBe(0)
  })

  it('menolak idempotencyKey serah terima yang sudah dipakai pesanan lain', async () => {
    const a = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })
    const b = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })
    await siapDiambil(a)
    await siapDiambil(b)

    const key = 'serah-terima-key-bentrok'
    const pertama = await inject(app, {
      method: 'POST',
      url: `/api/orders/${a.id}/serahkan`,
      headers,
      payload: { pembayaran: { metode: 'TUNAI', nominal: 14000, idempotencyKey: key } },
    })
    expect(pertama.statusCode).toBe(200)

    const kedua = await inject(app, {
      method: 'POST',
      url: `/api/orders/${b.id}/serahkan`,
      headers,
      payload: { pembayaran: { metode: 'TUNAI', nominal: 14000, idempotencyKey: key } },
    })
    expect(kedua.statusCode).toBe(409)
    expect(kedua.json().error.code).toBe('IDEMPOTENCY_KEY_BENTROK')

    const masih = await prisma.order.findUnique({ where: { id: b.id } })
    expect(masih.statusOrder).toBe('SELESAI')
    expect(masih.totalDibayar).toBe(0)
  })

  it('key pembayaran yang sudah ada tidak mencatat pembayaran ganda saat serah terima', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })

    // DP dicatat lebih dulu dengan key yang nanti dipakai lagi saat serah terima.
    const dp = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 5000, idempotencyKey: 'key-dp-lalu-serah' },
    })
    expect(dp.statusCode).toBe(201)

    await siapDiambil(order)

    const serah = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: {
        pembayaran: { metode: 'TUNAI', nominal: 5000, idempotencyKey: 'key-dp-lalu-serah' },
      },
    })

    expect(serah.statusCode).toBe(200)
    expect(serah.json().data.order.statusOrder).toBe('DIAMBIL')
    expect(serah.json().data.order.totalDibayar).toBe(5000)
    expect(await prisma.payment.count()).toBe(1)
  })

  it('koreksi OWNER SELESAI → PROSES mereset status "sudah dihubungi"', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      noHp: '081234567890',
    })
    await siapDiambil(order)

    const kontak = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/hubungi`,
      headers,
      payload: { via: 'WHATSAPP' },
    })
    expect(kontak.statusCode).toBe(200)
    expect(kontak.json().data.dihubungiAt).toBeTruthy()

    const ownerHeaders = (await loginAs(app, 'owner')).headers
    const koreksi = await inject(app, {
      method: 'PATCH',
      url: `/api/orders/${order.id}/status`,
      headers: ownerHeaders,
      payload: { statusOrder: 'PROSES', catatan: 'Cucian perlu dicuci ulang' },
    })

    expect(koreksi.statusCode).toBe(200)
    expect(koreksi.json().data.statusOrder).toBe('PROSES')
    expect(koreksi.json().data.dihubungiAt).toBeNull()
    expect(koreksi.json().data.dihubungiVia).toBeNull()
  })

  it('menyimpan janji bayar piutang dan menolak tanggal masa lalu', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })
    await siapDiambil(order)

    const lampau = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: { jatuhTempo: '2000-01-01' },
    })
    expect(lampau.statusCode).toBe(422)
    expect(lampau.json().error.code).toBe('JATUH_TEMPO_LAMPAU')

    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: { jatuhTempo: due },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.order.jatuhTempo).toBeTruthy()
    // Belum jatuh tempo, jadi belum muncul di filter penagihan.
    const belum = await inject(app, {
      method: 'GET',
      url: '/api/orders?jatuhTempo=true',
      headers,
    })
    expect(belum.statusCode).toBe(200)
    expect(belum.json().data).toHaveLength(0)

    // Simulasikan tanggal lewat agar filter penagihan bisa diuji.
    await prisma.order.update({
      where: { id: order.id },
      data: { jatuhTempo: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
    const lewat = await inject(app, {
      method: 'GET',
      url: '/api/orders?jatuhTempo=true',
      headers,
    })
    expect(lewat.statusCode).toBe(200)
    expect(lewat.json().data.map((item) => item.id)).toContain(order.id)
  })

  it('tidak menyimpan janji bayar bila serah terima langsung lunas', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })
    await siapDiambil(order)

    const due = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/serahkan`,
      headers,
      payload: {
        jatuhTempo: due,
        pembayaran: {
          metode: 'TUNAI',
          nominal: 14000,
          idempotencyKey: 'serah-lunas-dengan-jatuh-tempo',
        },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.order.statusPembayaran).toBe('LUNAS')
    expect(response.json().data.order.jatuhTempo).toBeNull()
  })
})

