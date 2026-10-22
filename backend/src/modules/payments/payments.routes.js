import { Router } from 'express'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwnerOrKasir } from '../../middleware/authorize.js'
import { listPaymentQuerySchema } from './payments.schema.js'
import * as paymentsService from './payments.service.js'

const router = Router()

router.use(requireAuth)

router.get(
  '/',
  requireOwnerOrKasir,
  validate({ query: listPaymentQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.list(req.valid.query)
    return ok(res, result.items, result.meta)
  }),
)

export default router
