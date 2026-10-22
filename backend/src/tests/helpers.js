import bcrypt from 'bcryptjs'
import request from 'supertest'
import { prisma } from '../lib/prisma.js'

/** Password semua user uji. */
export const TEST_PASSWORD = 'rahasia-uji-123'

/**
 * Bersihkan seluruh tabel uji dan buat pengguna + layanan dasar.
 * Dipanggil pada `beforeEach` di setiap file test.
 */
export async function resetDatabase() {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.orderStatusHistory.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.product.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.otherIncome.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.service.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.setting.deleteMany(),
    prisma.user.deleteMany(),
    prisma.counter.deleteMany(),
  ])

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4)

  const [owner, kasir, operator] = await Promise.all([
    prisma.user.create({
      data: {
        nama: 'Pemilik Uji',
        username: 'owner',
        passwordHash,
        role: 'OWNER',
      },
    }),
    prisma.user.create({
      data: {
        nama: 'Kasir Uji',
        username: 'kasir',
        passwordHash,
        role: 'KASIR',
      },
    }),
    prisma.user.create({
      data: {
        nama: 'Karangian Uji',
        username: 'operator',
        passwordHash,
        role: 'OPERATOR',
      },
    }),
  ])

  const [kiloan, satuan, express] = await Promise.all([
    prisma.service.create({
      data: {
        kode: 'KILO',
        nama: 'Cuci Kiloan',
        satuan: 'KG',
        hargaDefault: 7000,
        estimasiHari: 2,
        isAktif: true,
      },
    }),
    prisma.service.create({
      data: {
        kode: 'SATUAN',
        nama: 'Cuci Satuan',
        satuan: 'ITEM',
        hargaDefault: 8000,
        estimasiHari: 3,
        isAktif: true,
      },
    }),
    prisma.service.create({
      data: {
        kode: 'EXPRESS',
        nama: 'Cuci Express',
        satuan: 'ITEM',
        hargaDefault: 15000,
        estimasiHari: 1,
        isAktif: true,
      },
    }),
  ])

  return { owner, kasir, operator, services: { kiloan, satuan, express } }
}

/**
 * Login melalui API sungguhan dan kembalikan token + header Authorization.
 * Menguji alur autentikasi yang sama dengan yang dipakai frontend.
 */
export async function loginAs(app, username, password = TEST_PASSWORD) {
  const response = await inject(app, {
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  })

  if (response.statusCode !== 200) {
    throw new Error(
      `Login ${username} gagal (${response.statusCode}): ${response.body}`,
    )
  }

  const token = response.json().data.token
  return {
    token,
    headers: { authorization: `Bearer ${token}` },
    user: response.json().data.user,
  }
}

/**
 * Pembungkus supertest dengan antarmuka mirip `app.inject()`.
 * Backend ini Express (bukan Fastify), jadi kita adaptasi agar body test
 * tetap ringkas dan seragam.
 */
export function inject(app, { method = 'GET', url, headers = {}, payload }) {
  let req = request(app)[method.toLowerCase()](url)

  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value !== undefined && value !== null) req = req.set(key, value)
  }

  if (payload !== undefined) req = req.send(payload)

  return req.then((res) => ({
    statusCode: res.status,
    body: res.text,
    json: () => res.body,
  }))
}

/** Bikin pesanan lewat API. */
export async function buatPesanan(app, headers, payload = {}) {
  const response = await inject(app, {
    method: 'POST',
    url: '/api/orders',
    headers,
    payload: {
      namaPelanggan: 'Pelanggan Uji',
      items: [{ serviceId: payload.serviceId, qty: payload.qty ?? 2 }],
      ...payload,
    },
  })

  if (response.statusCode !== 201) {
    throw new Error(
      `Buat pesanan gagal (${response.statusCode}): ${response.body}`,
    )
  }

  return response.json().data
}
