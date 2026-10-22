import config from '../config/index.js'

/**
 * Helpers tanggal dalam zona waktu WIB (Asia/Jakarta).
 * Server bisa berjalan di UTC (Render) sehingga tanggal nota harus dihitung
 * dalam waktu lokal toko, bukan waktu server.
 */

const WIB = 'Asia/Jakarta'

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: WIB,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const monthFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: WIB,
  year: 'numeric',
  month: '2-digit',
})

/** "2026-10-21" */
export function wibDate(date = new Date()) {
  return dateFormatter.format(date)
}

/** "2026-10" */
export function wibMonth(date = new Date()) {
  return monthFormatter.format(date)
}

/** Label hari dalam Bahasa Indonesia, mis. "Rabu". */
const dayFormatter = new Intl.DateTimeFormat('id-ID', { timeZone: WIB, weekday: 'long' })
export function wibDayName(date = new Date()) {
  return dayFormatter.format(date)
}

/**
 * Rentang [start, end) dalam WIB untuk sebuah tanggal kalender.
 * end = start + 1 hari (WIB).
 */
export function wibDayRange(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+07:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { gte: start, lt: end }
}

/** Rentang [start, end) dalam WIB untuk rentang tanggal "YYYY-MM-DD". */
export function wibRange(fromStr, toStr) {
  const start = new Date(`${fromStr}T00:00:00+07:00`)
  const end = new Date(`${toStr}T00:00:00+07:00`)
  end.setDate(end.getDate() + 1)
  return { gte: start, lt: end }
}

/** Tanggal hari ini dalam WIB sebagai "YYYY-MM-DD". */
export function todayWib() {
  return wibDate(new Date())
}

export default { wibDate, wibMonth, wibDayName, wibDayRange, wibRange, todayWib }
