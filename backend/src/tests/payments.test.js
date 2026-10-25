import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { resetDatabase, loginAs, buatPesanan, inject } from './helpers.js'

const app = createApp()

describe('Pembayaran', () => {
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

  it('mencatat pembayaran tunai dan menandai pesanan lunas', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 14000 },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json().data
    expect(body.payment.nominal).toBe(14000)
    expect(body.payment.kembalian).toBe(0)
    expect(body.order.totalDibayar).toBe(14000)
    expect(body.order.sisaTagihan).toBe(0)
    expect(body.order.statusPembayaran).toBe('LUNAS')
    // Respons harus lengkap: POS/detail memakai items, payments, dan timeline.
    expect(body.order.items).toHaveLength(1)
    expect(body.order.items[0].namaService).toBeTruthy()
    expect(body.order.payments).toHaveLength(1)
    expect(body.order.statusHistory.length).toBeGreaterThan(0)
  })

  it('menghitung kembalian untuk pembayaran tunai kelebihan', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    }) // total 14000

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 20000 },
    })

    expect(response.statusCode).toBe(201)
    const body = response.json().data
    expect(body.payment.nominal).toBe(20000)
    expect(body.payment.kembalian).toBe(6000)
    // Yang dikredit ke pesanan hanya net: 20000 - 6000 = 14000
    expect(body.order.totalDibayar).toBe(14000)
    expect(body.order.statusPembayaran).toBe('LUNAS')
  })

  it('menolak pembayaran non-tunai yang melebihi sisa tagihan', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'QRIS', nominal: 20000 },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('NOMINAL_TERLALU_BESAR')
  })

  it('mendukung pembayaran sebagian (cicil)', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 3,
    }) // total 21000

    const pertama = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 10000 },
    })
    expect(pertama.statusCode).toBe(201)
    expect(pertama.json().data.order.totalDibayar).toBe(10000)
    expect(pertama.json().data.order.statusPembayaran).toBe('SEBAGIAN')
    expect(pertama.json().data.order.sisaTagihan).toBe(11000)

    const kedua = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 11000 },
    })
    expect(kedua.statusCode).toBe(201)
    expect(kedua.json().data.order.statusPembayaran).toBe('LUNAS')
  })

  it('MEMBUKTIKAN idempotensi pembayaran: idempotencyKey sama tidak menghasilkan pembayaran ganda', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })

    const idempotencyKey = 'kunci-uji-pembayaran-001'
    const payload = { metode: 'TUNAI', nominal: 14000, idempotencyKey }

    const pertama = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload,
    })
    const kedua = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload,
    })

    expect(pertama.statusCode).toBe(201)
    expect(kedua.statusCode).toBe(201)
    expect(kedua.json().data.payment.id).toBe(pertama.json().data.payment.id)
    expect(kedua.json().data.dibuatBaru).toBe(false)

    const jumlah = await prisma.payment.count()
    expect(jumlah).toBe(1)

    const refreshed = await prisma.order.findUnique({ where: { id: order.id } })
    expect(refreshed.totalDibayar).toBe(14000)
  })

  it('menolak pembayaran pada pesanan yang sudah lunas', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 1,
    })

    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 7000 },
    })

    const kedua = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 1000 },
    })

    expect(kedua.statusCode).toBe(409)
    expect(kedua.json().error.code).toBe('SUDAH_LUNAS')
  })

  it('menolak pembayaran pada pesanan yang dibatalkan', async () => {
    const ownerHeaders = (await loginAs(app, 'owner')).headers
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 1,
    })

    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: { alasan: 'Dibatalkan pelanggan' },
    })

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 7000 },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('PESANAN_VOID')
  })

  it('MENCEGAH over-payment: dua pembayaran bersamaan tidak boleh melebihi total', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    }) // total 14000

    // Dua kasir menekan tombol bayar bersamaan.
    const [a, b] = await Promise.all([
      inject(app, {
        method: 'POST',
        url: `/api/orders/${order.id}/pembayaran`,
        headers,
        payload: { metode: 'QRIS', nominal: 10000, idempotencyKey: 'kunci-a-12345678' },
      }),
      inject(app, {
        method: 'POST',
        url: `/api/orders/${order.id}/pembayaran`,
        headers,
        payload: { metode: 'QRIS', nominal: 10000, idempotencyKey: 'kunci-b-12345678' },
      }),
    ])

    const sukses = [a, b].filter((r) => r.statusCode === 201)
    const gagal = [a, b].filter((r) => r.statusCode !== 201)

    expect(sukses).toHaveLength(1)
    expect(gagal).toHaveLength(1)
    expect(gagal[0].statusCode).toBe(422)

    const refreshed = await prisma.order.findUnique({ where: { id: order.id } })
    expect(refreshed.totalDibayar).toBeLessThanOrEqual(refreshed.total)
  })

  it('menolak nominal nol atau negatif', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 1,
    })

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 0 },
    })

    expect(response.statusCode).toBe(422)
  })

  it('operator tidak boleh mencatat pembayaran', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 1,
    })
    const operatorHeaders = (await loginAs(app, 'operator')).headers

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers: operatorHeaders,
      payload: { metode: 'TUNAI', nominal: 7000 },
    })

    expect(response.statusCode).toBe(403)
  })
})
