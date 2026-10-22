import 'dotenv/config'

/**
 * Konfigurasi terpusat. Semua nilai dibaca sekali saat start.
 * Tidak ada kredensial yang di-hardcode — semuanya dari environment variable.
 */

function requiredInProduction(key) {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(
      `Environment variable ${key} wajib diisi di produksi. Lihat backend/.env.example`,
    )
  }
  return value
}

function num(key, fallback) {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} harus berupa angka`)
  }
  return parsed
}

const NODE_ENV = process.env.NODE_ENV || 'development'
const isProd = NODE_ENV === 'production'

if (isProd) {
  requiredInProduction('DATABASE_URL')
  const secret = requiredInProduction('JWT_SECRET')
  if (secret.length < 32) {
    throw new Error('JWT_SECRET minimal 32 karakter di produksi')
  }
}

const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

export const config = {
  env: NODE_ENV,
  isProd,
  isDev: !isProd,
  port: num('PORT', 4000),

  databaseUrl: process.env.DATABASE_URL || '',

  jwt: {
    secret: process.env.JWT_SECRET?.trim() || 'dev-only-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN?.trim() || '12h',
  },

  cors: {
    origins: corsOrigins,
    // Kosong = izinkan semua origin (hanya aman di development).
    allowAll: corsOrigins.length === 0 && !isProd,
  },

  loginRateLimit: num('LOGIN_RATE_LIMIT', 10),

  logLevel: process.env.LOG_LEVEL?.trim() || 'info',
}

export default config
