#!/usr/bin/env node
/**
 * Keep-alive pinger — ZIP-ZIPS LAUNDRI
 *
 * Render Free "tidur" (sleep) setelah 15 menit idle. Saat tidur, request
 * pertama butuh 30–50 detik untuk membangunkan instance. Untuk aplikasi kasir,
 * itu terasa lama.
 *
 * Pinger ini memanggil `/api/health` (endpoint tanpa query database) secara
 * berkala **hanya antara 06:00–21:00 WIB** — di luar jam itu tidak ada
 * transaksi, jadi membiarkan service tidur menghemat kuota 750 jam/bulan.
 *
 * Cara pakai:
 *   # sekali jalan (dipakai oleh cron / GitHub Actions)
 *   node scripts/keep-alive.js
 *
 *   # berjalan terus di background
 *   node scripts/keep-alive.js --loop
 *
 * Environment:
 *   API_URL      URL API (tanpa /api di akhir), default dari backend/.env
 *   INTERVAL_MS  jeda antar ping, default 10 menit
 *   START_HOUR   jam mulai (WIB), default 6
 *   END_HOUR     jam selesai (WIB), default 21
 */

import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
dotenv.config({ path: `${ROOT}backend/.env` })

const args = process.argv.slice(2)
const LOOP = args.includes('--loop')

const INTERVAL_MS = Number(process.env.INTERVAL_MS || 10 * 60 * 1000)
const START_HOUR = Number(process.env.START_HOUR ?? 6)
const END_HOUR = Number(process.env.END_HOUR ?? 21)

const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'http://localhost:4000')
  .replace(/\/+$/, '')

/** Jam WIB (UTC+7) saat ini. */
function nowWib() {
  return new Date(Date.now() + (7 * 60 + new Date().getTimezoneOffset()) * 60 * 1000)
}

/**
 * Format `YYYY-MM-DD HH:MM` dari objek Date yang sudah represents WIB.
 * Jangan pakai toISOString() — itu merender UTC, sehingga label jamnya
 * akan terlihat 7 jam lebih awal dari waktu sebenarnya.
 */
function formatWib(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

function withinWindow() {
  const now = nowWib()
  const hour = now.getHours()
  return hour >= START_HOUR && hour < END_HOUR
}

async function ping() {
  const now = nowWib()
  const stamp = formatWib(now)

  if (!withinWindow()) {
    console.log(`[${stamp} WIB] Di luar jam aktif (${START_HOUR}:00–${END_HOUR}:00 WIB) — dilewati.`)
    return { skipped: true }
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)

    const started = Date.now()
    const response = await fetch(`${API_URL}/api/health`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'zipzips-keep-alive/1.0' },
    })
    clearTimeout(timer)

    const duration = Date.now() - started

    if (response.ok) {
      console.log(`[${stamp} WIB] Ping OK (${response.status}, ${duration}ms)`)
      return { ok: true, duration }
    }

    console.warn(`[${stamp} WIB] Ping gagal: HTTP ${response.status}`)
    return { ok: false, status: response.status }
  } catch (error) {
    console.warn(`[${stamp} WIB] Ping error: ${error.message}`)
    return { ok: false, error: error.message }
  }
}

console.log(`Keep-alive pinger → ${API_URL}/api/health`)
console.log(`Jeda ${Math.round(INTERVAL_MS / 60000)} menit · jam aktif ${START_HOUR}:00–${END_HOUR}:00 WIB`)

if (!LOOP) {
  await ping()
  process.exit(0)
}

await ping()

setInterval(async () => {
  await ping()
}, INTERVAL_MS)
