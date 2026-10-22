import { z } from 'zod'

export const satuanProdukSchema = z.enum(['ML', 'L', 'KG', 'PCS'], {
  error: 'Satuan tidak valid',
})

export const createProductSchema = z.object({
  kode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Kode minimal 2 karakter')
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Kode hanya boleh huruf kapital, angka, dan strip'),
  nama: z.string().trim().min(2, 'Nama produk minimal 2 karakter').max(100),
  satuan: satuanProdukSchema,
  stokMinimum: z.number().int().min(0).optional().default(0),
  hargaBeliTerakhir: z.number().int().min(0).optional().nullable(),
})

export const updateProductSchema = createProductSchema
  .partial()
  .extend({ isAktif: z.boolean().optional() })

export const createMovementSchema = z
  .object({
    productId: z.string().uuid('Produk tidak valid'),
    tipe: z.enum(['MASUK', 'KELUAR', 'PENYESUAIAN'], { error: 'Tipe mutasi tidak valid' }),
    /** Jumlah untuk MASUK / KELUAR. */
    qty: z.number().int().min(1, 'Jumlah minimal 1').optional(),
    /** Stok fisik hasil opname untuk PENYESUAIAN. */
    stokAkhir: z.number().int().min(0, 'Stok akhir tidak boleh negatif').optional(),
    keterangan: z.string().trim().max(200).optional().nullable(),
    tanggal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tipe === 'PENYESUAIAN') {
      if (value.stokAkhir === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['stokAkhir'],
          message: 'Stok akhir wajib diisi untuk penyesuaian opname',
        })
      }
    } else if (value.qty === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['qty'],
        message: 'Jumlah wajib diisi untuk mutasi masuk/keluar',
      })
    }
  })

export const listMovementQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  tipe: z.enum(['MASUK', 'KELUAR', 'PENYESUAIAN']).optional(),
  dari: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  sampai: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus format YYYY-MM-DD')
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
})

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
})

export default {
  createProductSchema,
  updateProductSchema,
  createMovementSchema,
  listMovementQuerySchema,
  idParamSchema,
}
