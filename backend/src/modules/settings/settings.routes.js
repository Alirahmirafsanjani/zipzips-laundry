import { Router } from 'express'
import { ok, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner } from '../../middleware/authorize.js'
import { setSettingSchema, idParamSchema } from './settings.schema.js'
import * as settingsService from './settings.service.js'

const router = Router()

/**
 * Pengaturan publik (nama toko, alamat, nomor WhatsApp).
 * Tidak butuh token — dipakai oleh halaman login sebelum user masuk.
 */
router.get(
  '/publik',
  asyncHandler(async (req, res) => {
    const result = await settingsService.publik()
    return ok(res, result)
  }),
)

router.use(requireAuth)

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await settingsService.list()
    return ok(res, result)
  }),
)

router.put(
  '/:key',
  requireOwner,
  validate({ params: idParamSchema, body: setSettingSchema }),
  asyncHandler(async (req, res) => {
    const row = await settingsService.set(req.valid.params.key, req.body.value, req.user)
    return ok(res, row)
  }),
)

export default router
