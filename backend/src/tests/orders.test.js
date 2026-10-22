import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { resetDatabase, loginAs, buatPesanan, inject } from './helpers.js'

const app = createApp()

describe('Pesanan (order)', () => {
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

  describe('Pembuatan pesanan', () => {
    it('menghitung total dari master harga di server', async () => {
      const order = await buatPesanan(app, headers, {
        serviceId: services.kiloan.id,
        qty: 3,
      })

      // 3 kg × 7000 = 21000
      expect(order.subtotal).toBe(21000)
      expect(order.total).toBe(21000)
      expect(order.totalDibayar).toBe(0)
      expect(order.items).toHaveLength(1)
      expect(order.items[0].hargaSatuan).toBe(7000)
      expect(order.items[0].namaService).toBe('Cuci Kiloan')
    })

    it('menghasilkan nomor nota berformat ZZ-YYYYMMDD-0001', async () => {
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })
      expect(order.nomor).toMatch(/^ZZ-\d{8}-\d{4}$/)

      const kedua = await buatPesanan(app, headers, { serviceId: services.satuan.id })
      expect(kedua.nomor).not.toBe(order.nomor)
    })

    it('MEMBUKTIKAN idempotensi: clientRequestId yang sama menghasilkan pesanan yang sama', async () => {
      const clientRequestId = '11111111-2222-3333-4444-555555555555'
      const payload = {
        serviceId: services.kiloan.id,
        qty: 2,
        clientRequestId,
      }

      const pertama = await buatPesanan(app, headers, payload)
      const kedua = await buatPesanan(app, headers, payload)

      expect(kedua.id).toBe(pertama.id)
      expect(kedua.nomor).toBe(pertama.nomor)

      const jumlah = await prisma.order.count()
      expect(jumlah).toBe(1)
    })

    it('menerapkan diskon dan menolak diskon melebihi subtotal', async () => {
      const order = await buatPesanan(app, headers, {
        serviceId: services.kiloan.id,
        qty: 2,
        diskon: 5000,
      })
      expect(order.subtotal).toBe(14000)
      expect(order.diskon).toBe(5000)
      expect(order.total).toBe(9000)

      const response = await inject(app, {
        method: 'POST',
        url: '/api/orders',
        headers,
        payload: {
          items: [{ serviceId: services.kiloan.id, qty: 1 }],
          diskon: 999999,
        },
      })
      expect(response.statusCode).toBe(422)
      expect(response.json().error.code).toBe('DISKON_TERLALU_BESAR')
    })

    it('menolak pesanan tanpa item', async () => {
      const response = await inject(app, {
        method: 'POST',
        url: '/api/orders',
        headers,
        payload: { items: [] },
      })
      expect(response.statusCode).toBe(422)
    })

    it('menolak layanan yang tidak ada', async () => {
      const response = await inject(app, {
        method: 'POST',
        url: '/api/orders',
        headers,
        payload: {
          items: [
            { serviceId: '00000000-0000-0000-0000-000000000000', qty: 1 },
          ],
        },
      })
      expect(response.statusCode).toBe(422)
      expect(response.json().error.code).toBe('LAYANAN_TIDAK_ADA')
    })

    it('menyimpan snapshot harga saat pesanan dibuat (perubahan master tidak mengubah order lama)', async () => {
      const order = await buatPesanan(app, headers, {
        serviceId: services.kiloan.id,
        qty: 2,
      })

      await prisma.service.update({
        where: { id: services.kiloan.id },
        data: { hargaDefault: 9000 },
      })

      const diambil = await inject(app, {
        method: 'GET',
        url: `/api/orders/${order.id}`,
        headers,
      })

      expect(diambil.json().data.total).toBe(14000)
      expect(diambil.json().data.items[0].hargaSatuan).toBe(7000)
    })

    it('menyimpan nama pelanggan dari profil pelanggan terpilih', async () => {
      const customer = await prisma.customer.create({
        data: { kode: 'C0001', nama: 'Budi Santoso', noHp: '08123456789' },
      })

      const order = await buatPesanan(app, headers, {
        serviceId: services.kiloan.id,
        qty: 1,
        customerId: customer.id,
        namaPelanggan: 'Diabaikan',
      })

      expect(order.namaPelanggan).toBe('Budi Santoso')
      expect(order.noHp).toBe('08123456789')
    })
  })

  describe('Status pengerjaan', () => {
    it('mengubah status dan mencatat riwayatnya', async () => {
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

      const response = await inject(app, {
        method: 'PATCH',
        url: `/api/orders/${order.id}/status`,
        headers,
        payload: { statusOrder: 'PROSES', catatan: 'Sedang dicuci' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.statusOrder).toBe('PROSES')
      expect(response.json().data.statusHistory.length).toBe(2)

      const riwayat = response.json().data.statusHistory
      expect(riwayat[0].ke).toBe('DITERIMA')
      expect(riwayat[1].dari).toBe('DITERIMA')
      expect(riwayat[1].ke).toBe('PROSES')
    })

    it('menolak transisi status yang tidak sah', async () => {
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

      const response = await inject(app, {
        method: 'PATCH',
        url: `/api/orders/${order.id}/status`,
        headers,
        payload: { statusOrder: 'DIAMBIL' },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().error.code).toBe('TRANSISI_INVALID')
    })

    it('operator boleh mengubah status (karangian butuh ini)', async () => {
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })
      const operatorHeaders = (await loginAs(app, 'operator')).headers

      const response = await inject(app, {
        method: 'PATCH',
        url: `/api/orders/${order.id}/status`,
        headers: operatorHeaders,
        payload: { statusOrder: 'PROSES' },
      })

      expect(response.statusCode).toBe(200)
    })
  })

  describe('Pembatalan pesanan (void)', () => {
    it('owner dapat membatalkan dan pesanan dikeluarkan dari daftar default', async () => {
      const ownerHeaders = (await loginAs(app, 'owner')).headers
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

      const response = await inject(app, {
        method: 'POST',
        url: `/api/orders/${order.id}/void`,
        headers: ownerHeaders,
        payload: { alasan: 'Pelanggan membatalkan' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.voidedAt).not.toBeNull()
      expect(response.json().data.statusPembayaran).toBe('VOID')

      const daftar = await inject(app, {
        method: 'GET',
        url: '/api/orders',
        headers,
      })
      expect(daftar.json().data).toHaveLength(0)

      const denganVoid = await inject(app, {
        method: 'GET',
        url: '/api/orders?includeVoided=true',
        headers,
      })
      expect(denganVoid.json().data).toHaveLength(1)
    })

    it('menolak pembatalan tanpa alasan yang memadai', async () => {
      const ownerHeaders = (await loginAs(app, 'owner')).headers
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

      const response = await inject(app, {
        method: 'POST',
        url: `/api/orders/${order.id}/void`,
        headers: ownerHeaders,
        payload: { alasan: 'x' },
      })

      expect(response.statusCode).toBe(422)
    })

    it('menolak void pada pesanan yang sudah dibatalkan', async () => {
      const ownerHeaders = (await loginAs(app, 'owner')).headers
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

      await inject(app, {
        method: 'POST',
        url: `/api/orders/${order.id}/void`,
        headers: ownerHeaders,
        payload: { alasan: 'Alasan pertama' },
      })

      const kedua = await inject(app, {
        method: 'POST',
        url: `/api/orders/${order.id}/void`,
        headers: ownerHeaders,
        payload: { alasan: 'Alasan kedua' },
      })

      expect(kedua.statusCode).toBe(409)
      expect(kedua.json().error.code).toBe('SUDAH_VOID')
    })
  })

  describe('Pencarian & filter', () => {
    it('menemukan pesanan berdasarkan nomor nota', async () => {
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })

      const response = await inject(app, {
        method: 'GET',
        url: `/api/orders?search=${order.nomor}`,
        headers,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data).toHaveLength(1)
    })

    it('menyaring berdasarkan status', async () => {
      const order = await buatPesanan(app, headers, { serviceId: services.kiloan.id })
      await inject(app, {
        method: 'PATCH',
        url: `/api/orders/${order.id}/status`,
        headers,
        payload: { statusOrder: 'PROSES' },
      })

      const proses = await inject(app, {
        method: 'GET',
        url: '/api/orders?status=PROSES',
        headers,
      })
      expect(proses.json().data).toHaveLength(1)

      const diterima = await inject(app, {
        method: 'GET',
        url: '/api/orders?status=DITERIMA',
        headers,
      })
      expect(diterima.json().data).toHaveLength(0)
    })
  })
})
