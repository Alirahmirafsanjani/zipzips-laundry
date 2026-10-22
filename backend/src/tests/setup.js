/**
 * Setup global untuk integration test.
 *
 * WAJIB dieksekusi SEBELUM modul apa pun yang menyentuh Prisma diimpor.
 * Vitest menjalankan `setupFiles` sebelum file test, jadi override
 * DATABASE_URL di sini aman.
 *
 * Database uji: `zipzips_test` (buat sendiri, JANGAN menunjuk database produksi).
 */
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/zipzips_test?schema=public'

if (!/test/i.test(TEST_DATABASE_URL)) {
  throw new Error(
    'TEST_DATABASE_URL harus mengandung "test" agar tidak merusak database nyata. ' +
      `Diterima: ${TEST_DATABASE_URL}`,
  )
}

process.env.DATABASE_URL = TEST_DATABASE_URL
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-untuk-integration-test-wajib-32-karakter'
process.env.CORS_ORIGIN = ''
process.env.LOGIN_RATE_LIMIT = '1000'
