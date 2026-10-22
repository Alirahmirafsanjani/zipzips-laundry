import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createApp } from '../app.js'
import { prisma } from '../lib/prisma.js'
import { resetDatabase, loginAs, TEST_PASSWORD, inject } from './helpers.js'

const app = createApp()

describe('Autentikasi & otorisasi', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('POST /api/auth/login', () => {
    it('berhasil login dengan kredensial benar dan mengembalikan token + profil', async () => {
      const response = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'owner', password: TEST_PASSWORD },
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.data.token).toBeTypeOf('string')
      expect(body.data.user.username).toBe('owner')
      expect(body.data.user.role).toBe('OWNER')
      // Password hash tidak boleh ikut terbawa.
      expect(body.data.user.passwordHash).toBeUndefined()
    })

    it('menolak password salah dengan pesan generik (tidak membocorkan keberadaan akun)', async () => {
      const response = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'owner', password: 'salah-sekali' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().error.code).toBe('UNAUTHORIZED')
      expect(response.json().error.message).toContain('salah')
    })

    it('menolak request tanpa field wajib dengan 422', async () => {
      const response = await inject(app, {
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'owner' },
      })

      expect(response.statusCode).toBe(422)
      expect(response.json().error.code).toBe('VALIDATION_ERROR')
      expect(response.json().error.details.length).toBeGreaterThan(0)
    })
  })

  describe('GET /api/auth/me', () => {
    it('mengembalikan profil untuk token valid', async () => {
      const { headers } = await loginAs(app, 'kasir')
      const response = await inject(app, {
        method: 'GET',
        url: '/api/auth/me',
        headers,
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.username).toBe('kasir')
    })

    it('menolak request tanpa token', async () => {
      const response = await inject(app, { method: 'GET', url: '/api/auth/me' })
      expect(response.statusCode).toBe(401)
    })

    it('menolak token yang tidak valid', async () => {
      const response = await inject(app, {
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: 'Bearer token-ngawur' },
      })
      expect(response.statusCode).toBe(401)
    })
  })

  describe('Otorisasi berbasis peran', () => {
    it('kasir TIDAK boleh accessing /api/finance/ringkasan', async () => {
      const { headers } = await loginAs(app, 'kasir')
      const response = await inject(app, {
        method: 'GET',
        url: '/api/finance/ringkasan',
        headers,
      })

      expect(response.statusCode).toBe(403)
      expect(response.json().error.code).toBe('FORBIDDEN')
    })

    it('owner BOLEH accessing /api/finance/ringkasan', async () => {
      const { headers } = await loginAs(app, 'owner')
      const response = await inject(app, {
        method: 'GET',
        url: '/api/finance/ringkasan',
        headers,
      })

      expect(response.statusCode).toBe(200)
    })

    it('operator TIDAK boleh membuat pesanan', async () => {
      const { headers } = await loginAs(app, 'operator')
      const response = await inject(app, {
        method: 'POST',
        url: '/api/orders',
        headers,
        payload: { items: [{ serviceId: 'x', qty: 1 }] },
      })

      expect(response.statusCode).toBe(403)
    })

    it('operator BOLEH melihat daftar pesanan', async () => {
      const { headers } = await loginAs(app, 'operator')
      const response = await inject(app, {
        method: 'GET',
        url: '/api/orders',
        headers,
      })

      expect(response.statusCode).toBe(200)
    })

    it('kasir TIDAK boleh membatalkan pesanan', async () => {
      const { headers } = await loginAs(app, 'kasir')
      const response = await inject(app, {
        method: 'POST',
        url: '/api/orders/00000000-0000-0000-0000-000000000000/void',
        headers,
        payload: { alasan: 'coba' },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('Manajemen pengguna', () => {
    it('owner dapat membuat pengguna kasir baru', async () => {
      const { headers } = await loginAs(app, 'owner')
      const response = await inject(app, {
        method: 'POST',
        url: '/api/users',
        headers,
        payload: {
          nama: 'Kasir Baru',
          username: 'kasir.baru',
          password: 'katasandi6',
          role: 'KASIR',
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json().data.username).toBe('kasir.baru')
      expect(response.json().data.passwordHash).toBeUndefined()
    })

    it('menolak username ganda dengan 409', async () => {
      const { headers } = await loginAs(app, 'owner')
      const response = await inject(app, {
        method: 'POST',
        url: '/api/users',
        headers,
        payload: {
          nama: 'Duplikat',
          username: 'kasir',
          password: 'katasandi6',
          role: 'KASIR',
        },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().error.code).toBe('USERNAME_TAKEN')
    })

    it('tidak bisa menonaktifkan pemilik aktif terakhir', async () => {
      const { headers, user } = await loginAs(app, 'owner')
      const response = await inject(app, {
        method: 'PATCH',
        url: `/api/users/${user.id}`,
        headers,
        payload: { aktif: false },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().error.code).toBe('OWNER_TERAKHIR')
    })
  })
})
