import { Router } from 'express'
import { z } from 'zod'
import { ok, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner } from '../../middleware/authorize.js'
import { prisma } from '../../lib/prisma.js'
import { wibRange } from '../../lib/wib.js'

const router = Router()

const querySchema = z.object({
  entitas: z.string().trim().optional(),
  aksi: z.string().trim().optional(),
  userId: z.string().uuid().optional(),
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

router.use(requireAuth)
router.use(requireOwner)

router.get(
  '/',
  validate({ query: querySchema }),
  asyncHandler(async (req, res) => {
    const { entitas, aksi, userId, dari, sampai, page, limit } = req.valid.query

    const where = {}
    if (entitas) where.entitas = entitas
    if (aksi) where.aksi = aksi
    if (userId) where.userId = userId
    if (dari || sampai) {
      where.createdAt = wibRange(dari || '1970-01-01', sampai || '2999-12-31')
    }

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, nama: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return ok(res, items, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    })
  }),
)

export default router
