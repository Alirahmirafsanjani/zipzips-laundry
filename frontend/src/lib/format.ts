/** Format angka, mata uang, dan tanggal dalam konteks laundry Indonesia. */

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

const angka = new Intl.NumberFormat('id-ID')

export function formatRupiah(value: number | null | undefined): string {
  return rupiah.format(Number(value ?? 0))
}

export function formatAngka(value: number | null | undefined): string {
  return angka.format(Number(value ?? 0))
}

/** Berat/jumlah: 2,5 kg tampil sebagai "2,5"; bilangan bulat tanpa desimal. */
export function formatQty(value: number | string | null | undefined): string {
  const num = Number(value ?? 0)
  if (!Number.isFinite(num)) return '0'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num)
}

/** Normalisasi nomor HP Indonesia ke format internasional untuk wa.me. */
export function nomorWhatsApp(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

/** Angka bulat tanpa pemisah ribuan — untuk input. */
export function parseNominal(value: string): number {
  const cleaned = value.replace(/\D/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatTanggal(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatTanggalWaktu(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatWaktu(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatHariTanggal(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

/** Tanggal hari ini dalam format YYYY-MM-DD (WIB). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Tanggal N hari lalu (WIB) dalam format YYYY-MM-DD. */
export function daysAgoIso(days: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
}

/** Tanggal N hari ke depan (WIB) dalam format YYYY-MM-DD. */
export function daysAheadIso(days: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + days * 24 * 60 * 60 * 1000))
}

/** Awal bulan berjalan (WIB) YYYY-MM-DD. */
export function startOfMonthIso(): string {
  return `${todayIso().slice(0, 7)}-01`
}

export function initials(nama: string): string {
  return nama
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
