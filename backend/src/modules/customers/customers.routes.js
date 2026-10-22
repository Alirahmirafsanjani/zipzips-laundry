import { Router } from 'express'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwnerOrKasir } from '../../middleware/authorize.js'
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomerQuerySchema,
  idParamSchema,
} from './customers.schema.js'
import * as customersService from './customers.service.js'

const router = Router()

router.use(requireAuth)

router.get(
  '/',
  requireOwnerOrKasir,
  validate({ query: listCustomerQuerySchema }),
  asyncHandler(async (req, res) => {
    const { search, page, limit } = req.valid.query
    const result = await customersService.list({ search, page, limit })
    return ok(res, result.items, result.meta)
  }),
)

router.get(
  '/:id',
  requireOwnerOrKasir,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customersService.getById(req.valid.params.id)
    return ok(res, customer)
  }),
)

router.post(
  '/',
  requireOwnerOrKasir,
  validate({ body: createCustomerSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customersService.create(req.body, req.user)
    return created(res, customer)
  }),
)

router.patch(
  '/:id',
  requireOwnerOrKasir,
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customersService.update(req.valid.params.id, req.body, req.user)
    return ok(res, customer)
  }),
)

export default router
