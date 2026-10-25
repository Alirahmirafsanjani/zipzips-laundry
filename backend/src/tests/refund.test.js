import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { resetDatabase, loginAs, buatPesanan, inject } from './helpers.js'

const app = createApp()

const HARI_INI = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())

describe('Void & refund', () => {
  let kasirHeaders
  let ownerHeaders
  let services

  beforeEach(async () => {
    const data = await resetDatabase()
    services = data.services
    kasirHeaders = (await loginAs(app, 'kasir')).headers
    ownerHeaders = (await loginAs(app, 'owner')).headers
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function pesananBerbayar(nominal = 70000) {
    const order = await buatPesanan(app, kasirHeaders, {
      serviceId: services.kiloan.id,
      qty: 10,
    })
    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers: kasirHeaders,
      payload: { metode: 'TUNAI', nominal },
    })
    return order
  }

  it('menolak void pesanan berbayar tanpa keputusan refund', async () => {
    const order = await pesananBerbayar()

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: { alasan: 'Pelanggan batal' },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('REFUND_WAJIB_DIPUTUSKAN')

    const masihAktif = await prisma.order.findUnique({ where: { id: order.id } })
    expect(masihAktif.voidedAt).toBeNull()
  })

  it('mencatat refund penuh sebagai pengeluaran tanpa menghapus penerimaan kas', async () => {
    const order = await pesananBerbayar()

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: {
        alasan: 'Pelanggan batal',
        refund: {
          nominal: 70000,
          metodeBayar: 'TUNAI',
          keterangan: 'Uang dikembalikan tunai',
        },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data.voidedAt).not.toBeNull()

    const refund = await prisma.expense.findFirst({
      where: { refType: 'ORDER_REFUND', refId: order.id },
    })
    expect(refund).toMatchObject({
      kategori: 'REFUND',
      nominal: 70000,
      metodeBayar: 'TUNAI',
      keterangan: 'Uang dikembalikan tunai',
    })

    const ringkasan = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })
    const data = ringkasan.json().data

    expect(data.omzet).toBe(0)
    expect(data.penerimaanKas).toBe(70000)
    expect(data.pengeluaran).toBe(70000)
    expect(data.labaKas).toBe(0)
    expect(data.piutang).toBe(0)
  })

  it('mengizinkan refund 0 (uang tidak dikembalikan) sebagai keputusan eksplisit', async () => {
    const order = await pesananBerbayar()

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: {
        alasan: 'DP hangus karena pelanggan tidak mengambil',
        refund: { nominal: 0, metodeBayar: 'TUNAI' },
      },
    })

    expect(response.statusCode).toBe(200)

    const refund = await prisma.expense.findFirst({
      where: { refType: 'ORDER_REFUND', refId: order.id },
    })
    expect(refund).toBeNull()

    const ringkasan = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })
    const data = ringkasan.json().data
    expect(data.penerimaanKas).toBe(70000)
    expect(data.pengeluaran).toBe(0)
    expect(data.labaKas).toBe(70000)
  })

  it('mendukung refund sebagian', async () => {
    const order = await pesananBerbayar()

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: {
        alasan: 'Sebagian biaya hangus',
        refund: { nominal: 30000, metodeBayar: 'TRANSFER' },
      },
    })

    expect(response.statusCode).toBe(200)

    const ringkasan = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })
    const data = ringkasan.json().data
    expect(data.penerimaanKas).toBe(70000)
    expect(data.pengeluaran).toBe(30000)
    expect(data.labaKas).toBe(40000)
  })

  it('menolak refund melebihi total pembayaran', async () => {
    const order = await pesananBerbayar()

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: {
        alasan: 'Salah input',
        refund: { nominal: 70001, metodeBayar: 'TUNAI' },
      },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('REFUND_MELEBIHI_PEMBAYARAN')
  })

  it('void pesanan belum berbayar tidak memerlukan refund', async () => {
    const order = await buatPesanan(app, kasirHeaders, {
      serviceId: services.kiloan.id,
      qty: 1,
    })

    const response = await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: { alasan: 'Pelanggan batal sebelum bayar' },
    })

    expect(response.statusCode).toBe(200)

    const refund = await prisma.expense.findFirst({
      where: { refType: 'ORDER_REFUND', refId: order.id },
    })
    expect(refund).toBeNull()
  })
})
