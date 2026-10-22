#!/usr/bin/env node
/**
 * Diagnostik koneksi database untuk ZIP-ZIPS LAUNDRI.
 *
 * Masalah yang sering muncul saat pakai Supabase / proxy / PostgreSQL remote:
 *
 *   Error: DEPTH_ZERO_SELF_SIGNED_CERT: self signed certificate
 *
 * Arti: server DB/presentation-layer mengirim sertifikat yang ditandatangani
 * sendiri (self-signed) atau chain-nya tidak dipercaya, sementara Node
 * (`rejectUnauthorized: true`) memverifikasi sertifikat root CA lokal.
 *
 * Skrip ini menguji koneksi bertahap dan memberi rekomendasi konkret:
 *   1. Resolusi DNS
 *   2. Koneksi TCP
 *   3. TLS handshake + detail sertifikat (self-signed atau bukan)
 *   4. Query sungguhan lewat Prisma
 *
 * Cara pakai:
 *   node scripts/check-db-connection.js
 *   DATABASE_URL="postgresql://..." node scripts/check-db-connection.js
 *   node scripts/check-db-connection.js --host aws-0-ap-southeast-1.pooler.supabase.com --port 5432
 */

import { fileURLToPath } from 'node:url'
import net from 'node:net'
import tls from 'node:tls'
import dns from 'node:dns/promises'
import dotenv from 'dotenv'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

dotenv.config({ path: `${ROOT}backend/.env` })

const args = process.argv.slice(2)
function arg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
}

const URL_FROM_ARG = arg('url', process.env.DATABASE_URL || '')
const RAW_URL =
  URL_FROM_ARG ||
  'postgresql://postgres:postgres@localhost:5432/zipzips?schema=public'

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
}

const ok = (msg) => console.log(`${C.green}✔${C.reset} ${msg}`)
const bad = (msg) => console.log(`${C.red}✘${C.reset} ${msg}`)
const warn = (msg) => console.log(`${C.yellow}!${C.reset} ${msg}`)
const info = (msg) => console.log(`${C.dim}·${C.reset} ${msg}`)
const head = (msg) => console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`)

function parseUrl(raw) {
  try {
    const u = new URL(raw)
    return {
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username || ''),
      hasPassword: Boolean(u.password),
      sslmode: u.searchParams.get('sslmode'),
      search: u.searchParams.get('search_path'),
      isLocal: ['localhost', '127.0.0.1', '::1'].includes(u.hostname),
    }
  } catch {
    return null
  }
}

const parsed = parseUrl(RAW_URL)

if (!parsed) {
  bad(`DATABASE_URL tidak bisa dibaca: ${RAW_URL}`)
  console.log('\nFormat yang benar:')
  console.log('  postgresql://USER:PASSWORD@HOST:PORT/NAME?sslmode=require')
  process.exit(1)
}

console.log(`${C.bold}Diagnostik koneksi database${C.reset}`)
console.log(`${C.dim}${RAW_URL.replace(/:([^:@/]+)@/, ':<password>@')}${C.reset}`)

let failed = false

// --- 1. DNS -------------------------------------------------------------------
head('1. Resolusi DNS')
let addresses = []
try {
  const results = await dns.lookup(parsed.host, { all: true })
  addresses = results
  ok(`${parsed.host} → ${results.map((r) => `${r.address}${r.family === 6 ? ' (IPv6)' : ''}`).join(', ')}`)
} catch (error) {
  bad(`Gagal resolve ${parsed.host}: ${error.message}`)
  failed = true
}

// --- 2. TCP -------------------------------------------------------------------
head('2. Koneksi TCP')

function tryTcp(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ ok: false, error: 'TIMEOUT' })
    }, 5000)

    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ ok: true })
    })

    socket.once('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: error.code || error.message })
    })
  })
}

let tcpOk = false
for (const address of addresses) {
  const result = await tryTcp(address.address, parsed.port)
  if (result.ok) {
    ok(`Terhubung ke ${address.address}:${parsed.port}`)
    tcpOk = true
    break
  }
  warn(`${address.address}:${parsed.port} gagal (${result.error})`)
}

if (!tcpOk) {
  bad(`Tidak ada alamat yang bisa diakses di port ${parsed.port}`)
  console.log(`\n${C.yellow}Langkah:${C.reset}`)
  console.log('  • Cek firewall / VPN / jaringan.')
  console.log('  • Cek port: session pooler = 5432, transaction pooler = 6543.')
  process.exit(1)
}

// --- 3. TLS -------------------------------------------------------------------
head('3. TLS handshake (SSLRequest PostgreSQL)')

/**
 * PostgreSQL tidak memakai handshake TLS biasa. Klien mengirim paket
 * "SSLRequest" (8 byte) lalu server membalas 'S' (SSL didukung) atau 'N'
 * (tidak didukung). Barulah TLS-agreement terjadi.
 */
function tryPgSsl(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve({ error: 'TIMEOUT' })
    }, 5000)

    socket.once('connect', () => {
      // 00 00 00 08 | 04 D2 16 2F  (kode SSLRequest)
      socket.write(Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]))
    })

    socket.once('data', (chunk) => {
      clearTimeout(timer)
      const byte = chunk[0]

      if (byte === 0x4e) {
        // 'N' = server menolak SSL
        socket.destroy()
        resolve({ sslSupported: false })
        return
      }

      if (byte !== 0x53) {
        // 'S' = SSL didukung, lanjut ke handshake
        const tlsSocket = tls.connect(
          {
            socket,
            servername: parsed.isLocal ? undefined : host,
            rejectUnauthorized: false,
          },
          () => {
            const cert = tlsSocket.getPeerCertificate()
            const authorized = tlsSocket.authorized
            const authError = tlsSocket.authorizationError

            const subject = cert?.subject?.CN || '(tidak ada CN)'
            const issuer = cert?.issuer?.CN || '(tidak ada issuer)'
            const validTo = cert?.valid_to || '(tidak diketahui)'
            const selfSigned =
              Boolean(cert?.subject && cert?.issuer) &&
              JSON.stringify(cert.subject) === JSON.stringify(cert.issuer)

            tlsSocket.end()
            resolve({
              sslSupported: true,
              cert,
              authorized,
              authError,
              subject,
              issuer,
              validTo,
              selfSigned,
            })
          },
        )

        tlsSocket.once('error', (error) => resolve({ error }))
        setTimeout(() => tlsSocket.destroy(), 8000)
        return
      }

      socket.destroy()
      resolve({ error: 'respons SSLRequest tidak dikenali' })
    })

    socket.once('error', (error) => {
      clearTimeout(timer)
      resolve({ error: error.code || error.message })
    })
  })
}

let tlsResult = null
for (const address of addresses) {
  const result = await tryPgSsl(address.address, parsed.port)
  if (!result.error) {
    tlsResult = result
    break
  }
  warn(`SSLRequest ke ${address.address} gagal: ${result.error}`)
}

if (!tlsResult) {
  bad('Tidak bisa menyelesaikan negosiasi SSL')
  failed = true
} else if (tlsResult.sslSupported === false) {
  info('Server PostgreSQL menjawab "N" → koneksi TLS TIDAK didukung di host ini.')
  info('  Untuk koneksi lokal ini normal dan aman (loopback).')
  info('  Untuk Supabase, server WAJIB mendukung TLS — jika dapat "N",')
  info('  berarti port pooler-nya tertukar (5432 vs 6543).')
} else {
  const { subject, issuer, validTo, selfSigned, authorized, authError } = tlsResult

  ok(`TLS didukung. Sertifikat: subject=${subject}`)
  ok(`                          issuer=${issuer}`)
  ok(`                          berlaku sampai ${validTo}`)

  if (selfSigned) {
    warn('Sertifikat SELF-SIGNED (subject = issuer)')
    console.log('    → Node akan menolak dengan: DEPTH_ZERO_SELF_SIGNED_CERT')
  } else {
    ok('Sertifikat ditandatangani CA yang dipercaya')
  }

  if (!authorized && authError) {
    warn(`Verifikasi gagal: ${authError}`)
    console.log('    → Tambahkan &sslmode=no-verify pada DATABASE_URL untuk melewati')
    console.log('      verifikasi CA (koneksi tetap terenkripsi).')
  } else {
    ok('Verifikasi sertifikat berhasil')
  }
}

// --- 4. Query lewat Prisma ----------------------------------------------------
head('4. Query ke database (Prisma)')
try {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasources: { db: { url: RAW_URL } },
    log: [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }],
  })

  prisma.$on('error', (e) => info(`prisma error: ${e.message}`))
  prisma.$on('warn', (e) => info(`prisma warn: ${e.message}`))

  const rows = await prisma.$queryRawUnsafe('SELECT version()')
  ok(`Query berhasil: ${String(rows?.[0]?.version || '').split(',')[0]}`)

  await prisma.$disconnect()
} catch (error) {
  bad(`Query gagal: ${error.message.split('\n')[0]}`)

  const message = error.message || ''
  if (/DEPTH_ZERO_SELF_SIGNED_CERT|self signed certificate/i.test(message)) {
    console.log(`\n${C.bold}${C.yellow}Diagnosis: sertifikat server DB tidak dipercaya${C.reset}`)
    console.log('  Server memakai sertifikat self-signed (umum pada:')
    console.log('   • PostgreSQL lokal/VM yang TLS-nya di-enable tanpa CA resmi')
    console.log('   • Proxy/load balancer internal di depan database')
    console.log('   • Session pooler Supabase pada beberapa region')
    console.log('\n  Fix (pilih salah satu):')
    console.log('   A) Tambahkan parameter ini di DATABASE_URL:')
    console.log('        &sslmode=no-verify')
    console.log('      (Prisma: enkripsi TLS tanpa verifikasi CA — mesin tetap terenkripsi,')
    console.log('       hanya certificate pinning yang dilewati. Ini rekomendasi Supabase')
    console.log('       untuk Prisma dan cukup aman untuk free tier.)')
    console.log('')
    console.log('   B) Kalau server memakai sertifikat self-signed milik Anda sendiri,')
    console.log('      arahkan DATABASE_URL ke host yang benar, atau')
    console.log('      set SSLROOTCERT / NODE_EXTRA_CA_CERTS ke file CA Anda.')
    console.log('')
    console.log('   C) Untuk PostgreSQL lokal, pakai:  sslmode=disable  (tanpa TLS,')
    console.log('      aman karena lewat loopback).')
  } else if (/P1000|P1001|auth/i.test(message)) {
    console.log('\n  → Email/kata sandi salah, atau user tidak punya akses ke database.')
  } else if (/P1002|timeout|ETIMEDOUT/i.test(message)) {
    console.log('\n  → Timeout. Cek IP whitelist / firewall / port pooler.')
  } else if (/ECONNREFUSED/i.test(message)) {
    console.log('\n  → Port ditolak. Cek server DB menyala dan port benar (5432 vs 6543).')
  }
  failed = true
}

// --- Ringkasan ----------------------------------------------------------------
console.log(`\n${C.bold}Rekomendasi${C.reset}`)
if (!failed) {
  ok('Koneksi sehat. Tidak ada tindakan yang diperlukan.')
} else {
  const url = new URL(RAW_URL)
  if (!parsed.isLocal && !url.searchParams.get('sslmode')) {
    console.log('  • DATABASE_URL belum punya parameter sslmode. Untuk Supabase tambahkan:')
    console.log('      ?sslmode=require&connection_limit=5&pool_timeout=20')
  }
  if (!parsed.hasPassword) {
    console.log('  • URL tidak punya password — pastikan sudah di-URL-encode.')
  }
  if (parsed.port === 6543) {
    console.log('  • Port 6543 = transaction pooler. Prisma Migrate & $transaction')
    console.log('    interaktif MEMBUTUHKAN session pooler (port 5432). Ganti ke 5432.')
  }
}

console.log('')
process.exit(failed ? 1 : 0)
