import { Router } from 'express'
import { ok, asyncHandler } from '../../lib/http.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireAnyRole } from '../../middleware/authorize.js'
import * as dashboardService from './dashboard.service.js'

const router = Router()

router.use(requireAuth)

// Semua peran boleh membuka ringkasan. Untuk OPERATOR, service membuang
// field keuangan di server (bukan hanya disembunyikan di UI).
router.get(
  '/summary',
  requireAnyRole,
  asyncHandler(async (req, res) => {
    const result = await dashboardService.summary(req.user.role)
    return ok(res, result)
  }),
)

export default router
