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

/** Angka bulat tanpa pemisah ribuan — untuk input. */
export function parseNominal(value: string): number {
  const cleaned = value.replace(/[^\d-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export function formatTanggal(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
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
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatHariTanggal(iso: string | Date | null | undefined): string {
  if (!iso) return '-'
  const date = typeof iso === 'string' ? new Date(iso) : iso
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
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
