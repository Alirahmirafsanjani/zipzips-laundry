/**
 * Seed data awal — idempoten (aman dijalankan berulang kali).
 *
 * Cara menjalankan:
 *   npm run db:seed
 *
 * Password user awal:
 *  - Bila env SEED_OWNER_PASSWORD / SEED_KASIR_PASSWORD / SEED_OPERATOR_PASSWORD
 *    diisi, nilai itu yang dipakai.
 *  - Bila tidak diisi, password DIBUAT RANDOM dan dicetak ke terminal.
 *    Tidak ada password default yang dipaketkan di dalam source code.
 */
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

// Prisma CLI memuat .env secara otomatis, tetapi seed yang dijalankan
// langsung via `node prisma/seed.js` harus memuatnya sendiri.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const prisma = new PrismaClient()

const SALT_ROUNDS = 10

function randomPassword() {
  return `zz-${randomBytes(6).toString('base64url')}`
}

function pickPassword(envKey, fallback) {
  const fromEnv = process.env[envKey]
  if (fromEnv && fromEnv.trim()) {
    return { password: fromEnv.trim(), dibuatAcak: false }
  }
  return { password: randomPassword(), dibuatAcak: true }
}

const USERS = [
  {
    envKey: 'SEED_OWNER_PASSWORD',
    nama: 'Pemilik ZIP-ZIPS',
    username: 'owner',
    role: 'OWNER',
    noHp: process.env.SEED_OWNER_NOHP || null,
  },
  {
    envKey: 'SEED_KASIR_PASSWORD',
    nama: 'Kasir',
    username: 'kasir',
    role: 'KASIR',
    noHp: process.env.SEED_KASIR_NOHP || null,
  },
  {
    envKey: 'SEED_OPERATOR_PASSWORD',
    nama: 'Karangian',
    username: 'operator',
    role: 'OPERATOR',
    noHp: process.env.SEED_OPERATOR_NOHP || null,
  },
]

const SERVICES = [
  {
    kode: 'KILO',
    nama: 'Cuci Kiloan',
    satuan: 'KG',
    hargaDefault: 7000,
    estimasiHari: 2,
    deskripsi: 'Cuci kiloan biasa. Diterima setiap hari sebelum jam 12.00.',
  },
  {
    kode: 'SATUAN',
    nama: 'Cuci Satuan',
    satuan: 'ITEM',
    hargaDefault: 8000,
    estimasiHari: 3,
    deskripsi: 'Satuan per pcs (kaos, celana, handuk).',
  },
  {
    kode: 'EXPRESS',
    nama: 'Cuci Express',
    satuan: 'ITEM',
    hargaDefault: 15000,
    estimasiHari: 1,
    deskripsi: 'Selesai hari yang sama untuk pesanan sebelum jam 10.00.',
  },
]

const PRODUCTS = [
  {
    kode: 'DET',
    nama: 'Detergen Cair',
    satuan: 'ML',
    stokMinimum: 5000,
    hargaBeliTerakhir: 15000,
  },
  {
    kode: 'PEW',
    nama: 'Pewangi',
    satuan: 'ML',
    stokMinimum: 2000,
    hargaBeliTerakhir: 12000,
  },
  {
    kode: 'HANGER',
    nama: 'Hanger',
    satuan: 'PCS',
    stokMinimum: 50,
    hargaBeliTerakhir: 1500,
  },
]

const SETTINGS = [
  { key: 'namaToko', value: 'ZIP-ZIPS LAUNDRI' },
  { key: 'alamat', value: 'Bantul, Yogyakarta' },
  { key: 'noWhatsapp', value: '' },
  {
    key: 'catatanStruk',
    value: 'Terima kasih telah laundry di ZIP-ZIPS LAUNDRI!',
  },
  { key: 'estimasiHariKiloan', value: 2 },
  { key: 'estimasiHariSatuan', value: 3 },
  { key: 'estimasiHariExpress', value: 1 },
]

async function main() {
  console.log('[seed] mulai...')

  // --- Users -----------------------------------------------------------------
  const kredensialDicetak = []
  for (const spec of USERS) {
    const { password, dibuatAcak } = pickPassword(spec.envKey)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    await prisma.user.upsert({
      where: { username: spec.username },
      create: {
        nama: spec.nama,
        username: spec.username,
        passwordHash,
        role: spec.role,
        noHp: spec.noHp,
      },
      update: {
        nama: spec.nama,
        role: spec.role,
        noHp: spec.noHp,
        // Password TIDAK di-overwrite bila user sudah ada, kecuali env diset
        // eksplisit (memungkinkan reset yang disengaja).
        ...(process.env[`${spec.envKey}_RESET`] === 'true' ? { passwordHash } : {}),
      },
    })

    if (dibuatAcak) {
      kredensialDicetak.push({ username: spec.username, password })
    } else {
      console.log(`[seed] user "${spec.username}" (${spec.role}) siap.`)
    }
  }

  if (kredensialDicetak.length > 0) {
    console.log('\n============================================================')
    console.log('  KREDENSIAL AWAL (simpan sekarang, tidak disimpan di mana pun)')
    console.log('============================================================')
    for (const k of kredensialDicetak) {
      console.log(`  ${k.username.padEnd(10)} : ${k.password}`)
    }
    console.log('============================================================\n')
  }

  // --- Layanan ---------------------------------------------------------------
  for (const spec of SERVICES) {
    await prisma.service.upsert({
      where: { kode: spec.kode },
      create: { ...spec, isAktif: true },
      update: {
        nama: spec.nama,
        satuan: spec.satuan,
        hargaDefault: spec.hargaDefault,
        estimasiHari: spec.estimasiHari,
        deskripsi: spec.deskripsi,
        isAktif: true,
      },
    })
  }
  console.log(`[seed] ${SERVICES.length} layanan disiapkan.`)

  // --- Produk ----------------------------------------------------------------
  for (const spec of PRODUCTS) {
    await prisma.product.upsert({
      where: { kode: spec.kode },
      create: { ...spec, isAktif: true },
      update: {
        nama: spec.nama,
        satuan: spec.satuan,
        stokMinimum: spec.stokMinimum,
        hargaBeliTerakhir: spec.hargaBeliTerakhir,
        isAktif: true,
      },
    })
  }
  console.log(`[seed] ${PRODUCTS.length} produk disiapkan.`)

  // --- Pengaturan ------------------------------------------------------------
  for (const spec of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: spec.key },
      create: { key: spec.key, value: spec.value },
      update: {},
    })
  }
  console.log(`[seed] ${SETTINGS.length} pengaturan disiapkan.`)

  // --- Pembuka stok (agar stok tidak nol) -----------------------------------
  const openeran = [
    { kode: 'DET', qty: 10000, keterangan: 'Stok openeran deterjen' },
    { kode: 'PEW', qty: 5000, keterangan: 'Stok openeran pewangi' },
    { kode: 'HANGER', qty: 100, keterangan: 'Stok openeran hanger' },
  ]

  for (const spec of openeran) {
    const product = await prisma.product.findUnique({ where: { kode: spec.kode } })
    if (!product) continue

    const sudahAda = await prisma.stockMovement.findFirst({
      where: { productId: product.id, keterangan: spec.keterangan },
    })
    if (sudahAda) continue

    const agregat = await prisma.stockMovement.aggregate({
      where: { productId: product.id },
      _sum: { qty: true },
    })
    const stokSebelum = agregat._sum.qty ?? 0

    const owner = await prisma.user.findUnique({ where: { username: 'owner' } })

    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        tipe: 'MASUK',
        qty: spec.qty,
        stokSebelum,
        stokSesudah: stokSebelum + spec.qty,
        keterangan: spec.keterangan,
        createdById: owner.id,
      },
    })
  }
  console.log('[seed] stok openeran dicatat.')

  console.log('[seed] selesai.')
}

main()
  .catch((error) => {
    console.error('[seed] GAGAL:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
