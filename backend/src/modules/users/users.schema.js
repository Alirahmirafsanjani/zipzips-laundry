import { z } from 'zod'

export const roleSchema = z.enum(['OWNER', 'KASIR', 'OPERATOR'], {
  error: 'Peran tidak valid',
})

export const createUserSchema = z.object({
  nama: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username minimal 3 karakter')
    .max(50)
    .regex(/^[a-z0-9._-]+$/, 'Username hanya boleh huruf, angka, titik, garis, dan strip'),
  password: z.string().min(6, 'Kata sandi minimal 6 karakter').max(200),
  role: roleSchema,
  noHp: z.string().trim().max(30).optional().nullable(),
})

export const updateUserSchema = z.object({
  nama: z.string().trim().min(2).max(100).optional(),
  role: roleSchema.optional(),
  noHp: z.string().trim().max(30).optional().nullable(),
  aktif: z.boolean().optional(),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(6, 'Kata sandi minimal 6 karakter').max(200),
})

export const idParamSchema = z.object({
  id: z.string().uuid('ID tidak valid'),
})

export default {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  idParamSchema,
}
