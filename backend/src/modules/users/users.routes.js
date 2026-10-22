import { Router } from 'express'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner } from '../../middleware/authorize.js'
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  idParamSchema,
} from './users.schema.js'
import * as usersService from './users.service.js'

const router = Router()

router.use(requireAuth)

router.get(
  '/',
  requireOwner,
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || '').trim()
    const includeInactive = req.query.includeInactive !== 'false'
    const users = await usersService.list({ search, includeInactive })
    return ok(res, users)
  }),
)

router.post(
  '/',
  requireOwner,
  validate({ body: createUserSchema }),
  asyncHandler(async (req, res) => {
    const user = await usersService.create(req.body, req.user)
    return created(res, user)
  }),
)

router.patch(
  '/:id',
  requireOwner,
  validate({ params: idParamSchema, body: updateUserSchema }),
  asyncHandler(async (req, res) => {
    const user = await usersService.update(req.valid.params.id, req.body, req.user)
    return ok(res, user)
  }),
)

router.post(
  '/:id/reset-password',
  requireOwner,
  validate({ params: idParamSchema, body: resetPasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await usersService.resetPassword(
      req.valid.params.id,
      req.body.password,
      req.user,
    )
    return ok(res, result)
  }),
)

export default router
