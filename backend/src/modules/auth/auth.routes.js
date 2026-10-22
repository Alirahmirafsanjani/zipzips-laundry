import { Router } from 'express'
import rateLimit from 'express-rate-limit'

import config from '../../config/index.js'
import { ok, fail } from '../../lib/http.js'
import { asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { loginSchema, changePasswordSchema } from './auth.schema.js'
import * as authService from './auth.service.js'

const router = Router()

/** Pembatas brute-force per IP. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Terlalu banyak percobaan login. Silakan coba lagi dalam 15 menit.',
    },
  },
})

router.post(
  '/login',
  loginLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.login(req.body)
    return ok(res, result)
  }),
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.me(req.user.id)
    return ok(res, user)
  }),
)

router.post(
  '/change-password',
  requireAuth,
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await authService.changePassword({
      userId: req.user.id,
      passwordLama: req.body.passwordLama,
      passwordBaru: req.body.passwordBaru,
    })
    return ok(res, result)
  }),
)

export default router
