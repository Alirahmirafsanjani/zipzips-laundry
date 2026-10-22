import { Router } from 'express'
import { z } from 'zod'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner } from '../../middleware/authorize.js'
import {
  createProductSchema,
  updateProductSchema,
  createMovementSchema,
  listMovementQuerySchema,
  idParamSchema,
} from './inventory.schema.js'
import * as inventoryService from './inventory.service.js'

const router = Router()

router.use(requireAuth)

router.get(
  '/produk',
  requireOwner,
  validate({ query: z.object({ search: z.string().trim().optional().default('') }) }),
  asyncHandler(async (req, res) => {
    const products = await inventoryService.listProduk({ search: req.valid.query.search })
    return ok(res, products)
  }),
)

router.post(
  '/produk',
  requireOwner,
  validate({ body: createProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await inventoryService.createProduct(req.body, req.user)
    return created(res, product)
  }),
)

router.patch(
  '/produk/:id',
  requireOwner,
  validate({ params: idParamSchema, body: updateProductSchema }),
  asyncHandler(async (req, res) => {
    const product = await inventoryService.updateProduct(
      req.valid.params.id,
      req.body,
      req.user,
    )
    return ok(res, product)
  }),
)

router.get(
  '/mutasi',
  requireOwner,
  validate({ query: listMovementQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await inventoryService.listMovements(req.valid.query)
    return ok(res, result.items, result.meta)
  }),
)

router.post(
  '/mutasi',
  requireOwner,
  validate({ body: createMovementSchema }),
  asyncHandler(async (req, res) => {
    const movement = await inventoryService.createMovement(req.body, req.user)
    return created(res, movement)
  }),
)

export default router
