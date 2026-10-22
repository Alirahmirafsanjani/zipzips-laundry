import { prisma } from '../../lib/prisma.js'
import { HttpError } from '../../lib/errors.js'
import { writeAudit } from '../../lib/audit.js'

/**
 * Pengaturan aplikasi disimpan sebagai key-value di tabel `settings`
 * dengan nilai bertipe JSON. Default di bawah dipakai bila key belum pernah
 * disimpan, sehingga aplikasi tetap berfungsi pada instalasi baru.
 */
export const DEFAULT_SETTINGS = {
  namaToko: 'ZIP-ZIPS LAUNDRI',
  alamat: '',
  noWhatsapp: '',
  catatanStruk: 'Terima kasih telah laundry di ZIP-ZIPS LAUNDRI!',
  estimasiHariKiloan: 2,
  estimasiHariSatuan: 3,
  estimasiHariExpress: 1,
}

/** Key yang boleh ditampilkan tanpa login (halaman login). */
const PUBLIK_KEYS = ['namaToko', 'alamat', 'noWhatsapp']

export async function list() {
  const rows = await prisma.setting.findMany()
  const tersimpan = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  return { ...DEFAULT_SETTINGS, ...tersimpan }
}

export async function get(key) {
  const row = await prisma.setting.findUnique({ where: { key } })
  if (!row) {
    if (key in DEFAULT_SETTINGS) return DEFAULT_SETTINGS[key]
    throw HttpError.notFound(`Pengaturan "${key}" tidak ditemukan.`)
  }
  return row.value
}

export async function publik() {
  const semua = await list()
  return Object.fromEntries(PUBLIK_KEYS.map((key) => [key, semua[key]]))
}

export async function set(key, value, actor) {
  const before = await prisma.setting.findUnique({ where: { key } })

  const row = await prisma.setting.upsert({
    where: { key },
    create: { key, value, updatedBy: actor?.id ?? null },
    update: { value, updatedBy: actor?.id ?? null },
  })

  await writeAudit(prisma, {
    userId: actor?.id,
    aksi: 'UBAH_PENGATURAN',
    entitas: 'Setting',
    entitasId: key,
    detail: {
      summary: `Mengubah pengaturan "${key}"`,
      sebelum: before?.value ?? null,
      sesudah: value,
    },
  })

  return row
}
