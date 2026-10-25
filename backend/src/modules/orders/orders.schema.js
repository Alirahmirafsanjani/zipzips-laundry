import { z } from 'zod'
import { createPaymentSchema, metodeBayarSchema } from '../payments/payments.schema.js'

export const statusOrderSchema = z.enum(['DITERIMA', 'PROSES', 'SELESAI', 'DIAMBIL'], {
  error: 'Status pesanan tidak valid',
})

export const metodeHubungiSchema = z.enum(['WHATSAPP', 'TELEPON', 'LANGSUNG'], {
  error: 'Metode menghubungi tidak valid',
})

export const orderItemSchema = z.object({
  serviceId: z.string().uuid('Layanan tidak valid'),
  // Desimal untuk kiloan (mis. 2,5 kg); bilangan bulat untuk satuan ITEM
  // divalidasi di service karena bergantung pada master layanan.
  qty: z
    .number()
    .positive('Jumlah harus lebih dari nol')
    .max(9999, 'Jumlah terlalu besar'),
  // Harga opsional: bila diisi berarti kasir mengubah harga di layar.
  // Boleh diubah OWNER/KASIR; server tetap memvalidasi rentang.
  hargaSatuan: z.number().int().min(0, 'Harga tidak boleh negatif').optional(),
  catatan: z.string().trim().max(200).optional().nullable(),
})

export const createOrderSchema = z.object({
  customerId: z.string().uuid('Pelanggan tidak valid').optional().nullable(),
  namaPelanggan: z.string().trim().max(100).optional().nullable(),
  noHp: z.string().trim().max(30).optional().nullable(),
  items: z.array(orderItemSchema).min(1, 'Pesanan harus memiliki minimal 1 item'),
  diskon: z.number().int().min(0, 'Diskon tidak boleh negatif').optional().default(0),
  estimasiSelesai: z.string().optional().nullable(),
  catatan: z.string().trim().max(500).optional().nullable(),
  /**
   * UUID dari klien. Membuat pembuatan pesanan menjadi idempoten —
   * penting untuk mode offline: retry sinkronisasi tidak menghasilkan
   * pesanan ganda.
   */
  clientRequestId: z.string().trim().max(64, 'clientRequestId terlalu panjang').optional().nullable(),
  sumber: z.enum(['ONLINE', 'OFFLINE']).optional(),
})

export const listOrderQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  status: statusOrderSchema.optional(),
  dari: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  sampai: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  customerId: z.string().uuid().optional(),
  includeVoided: z.enum(['true', 'false']).optional().default('false'),
  /** Filter tugas admin: cucian SELESAI yang pelanggannya belum dikabari. */
  belumDihubungi: z.enum(['true', 'false']).optional().default('false'),
  /** Piutang yang sudah melewati tanggal janji bayar. */
  jatuhTempo: z.enum(['true', 'false']).optional().default('false'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const updateStatusSchema = z.object({
  statusOrder: statusOrderSchema,
  catatan: z.string().trim().max(300).optional().nullable(),
})

/**
 * Refund wajib diputuskan eksplisit bila pesanan sudah menerima pembayaran.
 * nominal 0 berarti uang tidak dikembalikan (mis. DP hangus), bukan "belum
 * diisi". Dengan begitu tidak ada void yang diam-diam menghilangkan kas.
 */
export const refundSchema = z.object({
  nominal: z
    .number()
    .int('Nominal refund harus bilangan bulat')
    .min(0, 'Nominal refund tidak boleh negatif'),
  metodeBayar: metodeBayarSchema,
  keterangan: z.string().trim().max(200).optional().nullable(),
})

export const voidOrderSchema = z.object({
  alasan: z
    .string()
    .trim()
    .min(3, 'Alasan pembatalan wajib diisi minimal 3 karakter')
    .max(300),
  refund: refundSchema.optional(),
})

export const updateNotesSchema = z.object({
  catatan: z.string().trim().max(500).optional().nullable(),
  catatanPengerjaan: z.string().trim().max(500).optional().nullable(),
})

/** Mencatat kontak ke pelanggan setelah cucian selesai. */
export const hubungiSchema = z.object({
  via: metodeHubungiSchema,
  catatan: z.string().trim().max(300).optional().nullable(),
})

/**
 * Serah terima: status DIAMBIL + pembayaran (opsional) dalam satu langkah.
 * Pembayaran boleh kosong bila pelanggan mengambil dengan status piutang.
 */
export const serahkanSchema = z.object({
  pembayaran: createPaymentSchema.optional().nullable(),
  /**
   * Tanggal janji bayar sisa tagihan (YYYY-MM-DD). Hanya relevan bila masih
   * ada sisa setelah serah terima.
   */
  jatuhTempo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal jatuh tempo harus format YYYY-MM-DD')
    .optional()
    .nullable(),
  catatan: z.string().trim().max(300).optional().nullable(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
})

export default {
  createOrderSchema,
  listOrderQuerySchema,
  updateStatusSchema,
  updateNotesSchema,
  voidOrderSchema,
  hubungiSchema,
  serahkanSchema,
  idParamSchema,
}
