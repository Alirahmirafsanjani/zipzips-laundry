import { z } from 'zod'
import { metodeBayarSchema } from '../payments/payments.schema.js'

export const kategoriPengeluaranSchema = z.enum(
  [
    'BAHAN_BAKU',
    'GAJI',
    'LISTRIK_GAS',
    'SEWA',
    'TRANSPORTASI',
    'PERAWATAN',
    'REFUND',
    'LAIN_LAIN',
  ],
  { error: 'Kategori pengeluaran tidak valid' },
)

export const kategoriPemasukanLainSchema = z.enum(
  ['PENJUALAN_BARANG', 'JASA_TAMBAHAN', 'LAIN_LAIN'],
  { error: 'Kategori pemasukan tidak valid' },
)

const tanggalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
  .optional()

export const createExpenseSchema = z.object({
  tanggal: tanggalSchema,
  kategori: kategoriPengeluaranSchema,
  keterangan: z.string().trim().min(2, 'Keterangan wajib diisi').max(200),
  nominal: z.number().int('Nominal harus bilangan bulat').min(1, 'Nominal minimal Rp1'),
  metodeBayar: metodeBayarSchema,
  refType: z.string().trim().max(40).optional().nullable(),
  refId: z.string().trim().max(40).optional().nullable(),
})

export const createOtherIncomeSchema = z.object({
  tanggal: tanggalSchema,
  kategori: kategoriPemasukanLainSchema,
  keterangan: z.string().trim().min(2, 'Keterangan wajib diisi').max(200),
  nominal: z.number().int('Nominal harus bilangan bulat').min(1, 'Nominal minimal Rp1'),
  metodeBayar: metodeBayarSchema,
})

export const rangeQuerySchema = z.object({
  dari: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  sampai: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
})

export const listExpenseQuerySchema = rangeQuerySchema.extend({
  kategori: kategoriPengeluaranSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const listOtherIncomeQuerySchema = rangeQuerySchema.extend({
  kategori: kategoriPemasukanLainSchema.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export default {
  createExpenseSchema,
  createOtherIncomeSchema,
  rangeQuerySchema,
  listExpenseQuerySchema,
  listOtherIncomeQuerySchema,
}
