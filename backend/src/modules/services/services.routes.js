import { Router } from 'express'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner } from '../../middleware/authorize.js'
import { createServiceSchema, updateServiceSchema, idParamSchema } from './services.schema.js'
import * as servicesService from './services.service.js'

const router = Router()

router.use(requireAuth)

/**
 * Semua peran boleh melihat daftar layanan. Harga default dibuang untuk
 * OPERATOR agar angka keuangan tidak pernah masuk ke responsnya.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const includeInactive = req.query.includeInactive === 'true'
    const services = await servicesService.list({
      includeInactive,
      role: req.user.role,
    })
    return ok(res, services)
  }),
)

router.post(
  '/',
  requireOwner,
  validate({ body: createServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = await servicesService.create(req.body, req.user)
    return created(res, service)
  }),
)

router.patch(
  '/:id',
  requireOwner,
  validate({ params: idParamSchema, body: updateServiceSchema }),
  asyncHandler(async (req, res) => {
    const service = await servicesService.update(req.valid.params.id, req.body, req.user)
    return ok(res, service)
  }),
)

router.post(
  '/:id/arsipkan',
  requireOwner,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const service = await servicesService.archive(req.valid.params.id, req.user)
    return ok(res, service)
  }),
)

export default router
