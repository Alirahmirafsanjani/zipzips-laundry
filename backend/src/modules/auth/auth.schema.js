import { z } from 'zod'

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Username wajib diisi')
    .max(50, 'Username maksimal 50 karakter'),
  password: z.string().min(1, 'Kata sandi wajib diisi').max(200),
})

export const changePasswordSchema = z.object({
  passwordLama: z.string().min(1, 'Kata sandi lama wajib diisi'),
  passwordBaru: z
    .string()
    .min(6, 'Kata sandi baru minimal 6 karakter')
    .max(200, 'Kata sandi terlalu panjang')
    .refine((value) => value.trim().length >= 6, {
      message: 'Kata sandi baru minimal 6 karakter',
    }),
})

export default { loginSchema, changePasswordSchema }
