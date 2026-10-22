import { z } from 'zod'

export const metodeBayarSchema = z.enum(['TUNAI', 'QRIS', 'TRANSFER'], {
  error: 'Metode pembayaran tidak valid',
})

export const createPaymentSchema = z.object({
  metode: metodeBayarSchema,
  nominal: z.number().int('Nominal harus bilangan bulat').min(1, 'Nominal minimal Rp1'),
  /**
   * Referensi manual QRIS (kode/keterangan yang dilihat kasir di HP).
   * Tidak ada integrasi API QRIS pada MVP.
   */
  referensi: z.string().trim().max(100).optional().nullable(),
  catatan: z.string().trim().max(200).optional().nullable(),
  /**
   * Kunci idempotensi. WAJIB dikirim oleh frontend POS agar klik ganda
   * atau retry jaringan tidak menghasilkan pembayaran ganda.
   */
  idempotencyKey: z.string().trim().min(8).max(100).optional(),
})

export const listPaymentQuerySchema = z.object({
  metode: metodeBayarSchema.optional(),
  dari: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  sampai: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  orderId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
})

export default { createPaymentSchema, listPaymentQuerySchema, idParamSchema }
