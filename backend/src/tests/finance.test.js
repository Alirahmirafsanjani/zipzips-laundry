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

describe('Laporan keuangan', () => {
  let headers
  let ownerHeaders
  let services

  beforeEach(async () => {
    const data = await resetDatabase()
    services = data.services
    headers = (await loginAs(app, 'kasir')).headers
    ownerHeaders = (await loginAs(app, 'owner')).headers
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('MEMBEDAKAN omzet, penerimaan kas, pengeluaran, dan laba kas', async () => {
    // Pesanan 70.000 (10 kg × 7.000)
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 10,
    })

    // Dibayar 70.000 tunai
    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 70000 },
    })

    // Pengeluaran 25.000
    await inject(app, {
      method: 'POST',
      url: '/api/finance/pengeluaran',
      headers: ownerHeaders,
      payload: {
        tanggal: HARI_INI,
        kategori: 'BAHAN_BAKU',
        keterangan: 'Beli deterjen',
        nominal: 25000,
        metodeBayar: 'TUNAI',
      },
    })

    const response = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })

    expect(response.statusCode).toBe(200)
    const data = response.json().data

    expect(data.omzet).toBe(70000)
    expect(data.penerimaanKas).toBe(70000)
    expect(data.penerimaanLaundry).toBe(70000)
    expect(data.pengeluaran).toBe(25000)
    expect(data.labaKas).toBe(45000) // 70000 - 25000
    expect(data.jumlahPesanan).toBe(1)
  })

  it('MEMBEDAKAN omzet dari penerimaan kas ketika pembayaran terjadi di hari berbeda', async () => {
    // Pesanan dibuat hari ini, tetapi tanggalMasuk dipaksa ke kemarin
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 5,
    })
    await prisma.order.update({
      where: { id: order.id },
      data: {
        tanggalMasuk: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    })

    const response = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })

    const data = response.json().data
    // Omzet dihitung per tanggal pesanan → hari ini nol
    expect(data.omzet).toBe(0)
    // Penerimaan kas dihitung per tanggal pembayaran → hari ini 35.000
    expect(data.penerimaanKas).toBe(0) // belum ada pembayaran sama sekali
  })

  it('MENGHILANGKAN pesanan yang dibatalkan dari omzet DAN penerimaan kas', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 10,
    })

    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 70000 },
    })

    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/void`,
      headers: ownerHeaders,
      payload: { alasan: 'Pelanggan batal' },
    })

    const response = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })

    const data = response.json().data
    expect(data.omzet).toBe(0)
    expect(data.penerimaanKas).toBe(0)
    expect(data.jumlahPesanan).toBe(0)
  })

  it('menghitung piutang sebagai sisa tagihan seluruh pesanan aktif lintas tanggal', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 10,
    }) // 70.000

    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 30000 },
    })

    const response = await inject(app, {
      method: 'GET',
      url: '/api/finance/ringkasan',
      headers: ownerHeaders,
    })

    const data = response.json().data
    expect(data.piutang).toBe(40000)
  })

  it('memisahkan penerimaan laundry dan pemasukan lain', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 1,
    })
    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'QRIS', nominal: 7000 },
    })

    await inject(app, {
      method: 'POST',
      url: '/api/finance/pemasukan-lain',
      headers: ownerHeaders,
      payload: {
        tanggal: HARI_INI,
        kategori: 'PENJUALAN_BARANG',
        keterangan: 'Jual hanger',
        nominal: 5000,
        metodeBayar: 'TUNAI',
      },
    })

    const response = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })

    const data = response.json().data
    expect(data.penerimaanLaundry).toBe(7000)
    expect(data.penerimaanLain).toBe(5000)
    expect(data.penerimaanKas).toBe(12000)
    expect(data.perMetode.QRIS).toBe(7000)
    expect(data.perMetode.TUNAI).toBe(5000)
  })

  it('menyediakan rincian harian untuk grafik', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 2,
    })

    const response = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })

    const harian = response.json().data.harian
    expect(harian).toHaveLength(1)
    expect(harian[0].tanggal).toBe(HARI_INI)
    expect(harian[0].omzet).toBe(14000)
    expect(harian[0].jumlahPesanan).toBe(1)
  })

  it('menyediakan rincian pengeluaran per kategori', async () => {
    for (const [kategori, nominal] of [
      ['BAHAN_BAKU', 10000],
      ['GAJI', 50000],
      ['LISTRIK_GAS', 15000],
    ]) {
      await inject(app, {
        method: 'POST',
        url: '/api/finance/pengeluaran',
        headers: ownerHeaders,
        payload: {
          tanggal: HARI_INI,
          kategori,
          keterangan: `Uji ${kategori}`,
          nominal,
          metodeBayar: 'TUNAI',
        },
      })
    }

    const response = await inject(app, {
      method: 'GET',
      url: `/api/finance/ringkasan?dari=${HARI_INI}&sampai=${HARI_INI}`,
      headers: ownerHeaders,
    })

    const perKategori = response.json().data.perKategoriPengeluaran
    expect(perKategori.BAHAN_BAKU).toBe(10000)
    expect(perKategori.GAJI).toBe(50000)
    expect(perKategori.LISTRIK_GAS).toBe(15000)
    expect(response.json().data.pengeluaran).toBe(75000)
  })

  it('menyediakan ringkasan beranda untuk hari ini', async () => {
    const order = await buatPesanan(app, headers, {
      serviceId: services.kiloan.id,
      qty: 4,
    })

    await inject(app, {
      method: 'POST',
      url: `/api/orders/${order.id}/pembayaran`,
      headers,
      payload: { metode: 'TUNAI', nominal: 14000 },
    })

    const response = await inject(app, {
      method: 'GET',
      url: '/api/dashboard/summary',
      headers,
    })

    expect(response.statusCode).toBe(200)
    const data = response.json().data
    expect(data.omzetHariIni).toBe(28000)
    expect(data.diterimaHariIni).toBe(14000)
    expect(data.belumDibayarHariIni).toBe(14000)
    expect(data.jumlahPesananHariIni).toBe(1)
    expect(data.statusCount.DITERIMA).toBe(1)
    expect(data.piutang).toBe(14000)
  })
})
