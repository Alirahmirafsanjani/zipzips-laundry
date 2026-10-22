import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { resetDatabase, loginAs, inject } from './helpers.js'

const app = createApp()

describe('Stok bahan', () => {
  let ownerHeaders
  let produk

  beforeEach(async () => {
    await resetDatabase()
    ownerHeaders = (await loginAs(app, 'owner')).headers

    produk = await prisma.product.create({
      data: {
        kode: 'DET',
        nama: 'Detergen Cair',
        satuan: 'ML',
        stokMinimum: 5000,
        hargaBeliTerakhir: 15000,
        isAktif: true,
      },
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('stok awal 0 dan bertambah saat mutasi MASUK', async () => {
    const daftar = await inject(app, {
      method: 'GET',
      url: '/api/inventory/produk',
      headers: ownerHeaders,
    })

    expect(daftar.json().data[0].stok).toBe(0)

    const mutasi = await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'MASUK', qty: 10000 },
    })

    expect(mutasi.statusCode).toBe(201)
    expect(mutasi.json().data.stokSebelum).toBe(0)
    expect(mutasi.json().data.stokSesudah).toBe(10000)
    expect(mutasi.json().data.qty).toBe(10000)
  })

  it('stok = SUM(mutasi), bukan kolom yang dikurangi', async () => {
    await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'MASUK', qty: 10000 },
    })
    await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'KELUAR', qty: 2500 },
    })

    const daftar = await inject(app, {
      method: 'GET',
      url: '/api/inventory/produk',
      headers: ownerHeaders,
    })

    expect(daftar.json().data[0].stok).toBe(7500)
  })

  it('menolak KELUAR melebihi stok yang tersedia', async () => {
    await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'MASUK', qty: 1000 },
    })

    const response = await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'KELUAR', qty: 5000 },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().error.code).toBe('STOK_TIDAK_CUKUP')
  })

  it('PENYESUAIAN (opname) menghitung selisih terhadap stok fisik', async () => {
    await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'MASUK', qty: 10000 },
    })

    const response = await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'PENYESUAIAN', stokAkhir: 9500 },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json().data.qty).toBe(-500)
    expect(response.json().data.stokSesudah).toBe(9500)
  })

  it('menandai produk yang stoknya menipis', async () => {
    await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'MASUK', qty: 3000 },
    })

    const daftar = await inject(app, {
      method: 'GET',
      url: '/api/inventory/produk',
      headers: ownerHeaders,
    })

    expect(daftar.json().data[0].stokMenipis).toBe(true)
  })

  it('kasir tidak boleh mencatat mutasi stok', async () => {
    const kasirHeaders = (await loginAs(app, 'kasir')).headers

    const response = await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: kasirHeaders,
      payload: { productId: produk.id, tipe: 'MASUK', qty: 100 },
    })

    expect(response.statusCode).toBe(403)
  })

  it('menolak mutasi PENYESUAIAN tanpa stokAkhir', async () => {
    const response = await inject(app, {
      method: 'POST',
      url: '/api/inventory/mutasi',
      headers: ownerHeaders,
      payload: { productId: produk.id, tipe: 'PENYESUAIAN' },
    })

    expect(response.statusCode).toBe(422)
  })
})
