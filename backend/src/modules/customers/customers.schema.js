import { z } from 'zod'

export const createCustomerSchema = z.object({
  nama: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  noHp: z.string().trim().max(30).optional().nullable(),
  alamat: z.string().trim().max(300).optional().nullable(),
  catatan: z.string().trim().max(500).optional().nullable(),
})

export const updateCustomerSchema = createCustomerSchema.partial()

export const listCustomerQuerySchema = z.object({
  search: z.string().trim().optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
})

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
})

export default { createCustomerSchema, updateCustomerSchema, listCustomerQuerySchema, idParamSchema }
