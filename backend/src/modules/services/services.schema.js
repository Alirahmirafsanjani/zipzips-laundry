import { z } from 'zod'

export const satuanSchema = z.enum(['KG', 'ITEM'], { error: 'Satuan tidak valid' })

export const createServiceSchema = z.object({
  kode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Kode minimal 2 karakter')
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Kode hanya boleh huruf kapital, angka, dan strip'),
  nama: z.string().trim().min(2, 'Nama layanan minimal 2 karakter').max(100),
  satuan: satuanSchema,
  hargaDefault: z.number().int('Harga harus bilangan bulat').min(0, 'Harga tidak boleh negatif'),
  estimasiHari: z.number().int().min(0).max(60).optional(),
  deskripsi: z.string().trim().max(500).optional().nullable(),
})

export const updateServiceSchema = createServiceSchema.partial().extend({
  isAktif: z.boolean().optional(),
})

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
})

export default { createServiceSchema, updateServiceSchema, idParamSchema }
