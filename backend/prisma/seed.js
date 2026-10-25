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
 *  - Di produksi (NODE_ENV=production), password acak DITOLAK karena hanya
 *    muncul di log dan mudah hilang. Isi env password sebelum deploy pertama.
 *
 * Idempoten:
 *  - User yang sudah ada TIDAK diubah passwordnya dan tidak dicetak ulang.
 *  - noHp hanya ditimpa bila env SEED_*_NOHP diisi.
 *  - Reset password hanya bila SEED_*_PASSWORD_RESET=true.
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
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function randomPassword() {
  return `zz-${randomBytes(6).toString('base64url')}`
}

function pickPassword(envKey) {
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
  // Rencanakan dulu semua user SEBELUM menulis apa pun. Dengan begitu,
  // konfigurasi produksi yang kurang lengkap tidak menghasilkan seed separuh.
  const existingUsers = await Promise.all(
    USERS.map((spec) => prisma.user.findUnique({ where: { username: spec.username } })),
  )

  const rencanaUser = USERS.map((spec, index) => {
    const existing = existingUsers[index]
    const reset = process.env[`${spec.envKey}_RESET`] === 'true'
    const perluPassword = !existing || reset

    if (perluPassword && IS_PRODUCTION && !process.env[spec.envKey]?.trim()) {
      throw new Error(
        `${spec.envKey} wajib diisi di produksi untuk membuat/reset user ` +
          `"${spec.username}". Isi di environment Render sebelum deploy pertama.`,
      )
    }

    return { spec, existing, reset, perluPassword }
  })

  const kredensialDicetak = []
  for (const { spec, existing, reset, perluPassword } of rencanaUser) {
    // Data profil yang aman diperbarui tanpa menyentuh password.
    const profil = {
      nama: spec.nama,
      role: spec.role,
      // Jangan menimpa nomor HP yang sudah tersimpan dengan NULL hanya karena
      // env SEED_*_NOHP tidak diisi.
      ...(spec.noHp ? { noHp: spec.noHp } : {}),
    }

    if (!perluPassword) {
      await prisma.user.update({ where: { username: spec.username }, data: profil })
      console.log(
        `[seed] user "${spec.username}" (${spec.role}) sudah ada — password tidak diubah.`,
      )
      continue
    }

    const { password, dibuatAcak } = pickPassword(spec.envKey)
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)

    if (existing) {
      await prisma.user.update({
        where: { username: spec.username },
        data: { ...profil, passwordHash },
      })
      console.log(`[seed] password user "${spec.username}" direset.`)
    } else {
      await prisma.user.create({
        data: {
          ...profil,
          username: spec.username,
          passwordHash,
          noHp: spec.noHp,
        },
      })
      console.log(`[seed] user "${spec.username}" (${spec.role}) dibuat.`)
    }

    if (dibuatAcak) {
      kredensialDicetak.push({ username: spec.username, password })
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
