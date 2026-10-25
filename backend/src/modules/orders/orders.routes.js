import { Router } from 'express'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner, requireOwnerOrKasir, requireAnyRole } from '../../middleware/authorize.js'
import {
  createOrderSchema,
  listOrderQuerySchema,
  updateStatusSchema,
  updateNotesSchema,
  voidOrderSchema,
  hubungiSchema,
  serahkanSchema,
  idParamSchema,
} from './orders.schema.js'
import { createPaymentSchema } from '../payments/payments.schema.js'
import * as ordersService from './orders.service.js'
import * as paymentsService from '../payments/payments.service.js'

const router = Router()

router.use(requireAuth)

/**
 * Daftar pesanan. OPERATOR boleh melihat daftar (ia perlu tahu pesanan mana
 * yang siap diambil) tetapi tidak boleh melihat angka keuangan.
 */
router.get(
  '/',
  requireAnyRole,
  validate({ query: listOrderQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await ordersService.list(req.valid.query, req.user.role)
    return ok(res, result.items, result.meta)
  }),
)

router.get(
  '/:id',
  requireAnyRole,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.getById(req.valid.params.id, req.user.role)
    return ok(res, order)
  }),
)

router.post(
  '/',
  requireOwnerOrKasir,
  validate({ body: createOrderSchema }),
  asyncHandler(async (req, res) => {
    const { order, dibuatBaru } = await ordersService.create(req.body, req.user)
    return created(res, order, { dibuatBaru })
  }),
)

/** Ubah status pengerjaan. Semua peran boleh (karangian perlu ini). */
router.patch(
  '/:id/status',
  requireAnyRole,
  validate({ params: idParamSchema, body: updateStatusSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.updateStatus(
      req.valid.params.id,
      { statusOrder: req.body.statusOrder, catatan: req.body.catatan },
      req.user,
    )
    return ok(res, order)
  }),
)

/** Catat bahwa pelanggan sudah dihubungi (WA/telepon) setelah cucian selesai. */
router.post(
  '/:id/hubungi',
  requireOwnerOrKasir,
  validate({ params: idParamSchema, body: hubungiSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.hubungi(
      req.valid.params.id,
      { via: req.body.via, catatan: req.body.catatan },
      req.user,
    )
    return ok(res, order)
  }),
)

/**
 * Serah terima cucian: status → DIAMBIL dan (opsional) catat pembayaran
 * dalam satu transaksi. Inilah langkah "pelanggan menjemput dan membayar".
 */
router.post(
  '/:id/serahkan',
  requireOwnerOrKasir,
  validate({ params: idParamSchema, body: serahkanSchema }),
  asyncHandler(async (req, res) => {
    const result = await ordersService.serahkan(
      req.valid.params.id,
      {
        pembayaran: req.body.pembayaran,
        jatuhTempo: req.body.jatuhTempo,
        catatan: req.body.catatan,
      },
      req.user,
    )
    return ok(res, result)
  }),
)

/**
 * Catatan pesanan. OPERATOR boleh mengisi `catatanPengerjaan`; field
 * `catatan` pelanggan tetap dibatasi di service untuk OWNER/KASIR.
 */
router.patch(
  '/:id/catatan',
  requireAnyRole,
  validate({ params: idParamSchema, body: updateNotesSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.updateNotes(req.valid.params.id, req.body, req.user)
    return ok(res, order)
  }),
)

/** Pembatalan pesanan. HANYA pemilik. */
router.post(
  '/:id/void',
  requireOwner,
  validate({ params: idParamSchema, body: voidOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.voidOrder(req.valid.params.id, req.body, req.user)
    return ok(res, order)
  }),
)

/** Riwayat pembayaran satu pesanan. */
router.get(
  '/:id/pembayaran',
  requireOwnerOrKasir,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const order = await ordersService.getById(req.valid.params.id)
    return ok(res, order.payments)
  }),
)

/** Catat pembayaran. */
router.post(
  '/:id/pembayaran',
  requireOwnerOrKasir,
  validate({ params: idParamSchema, body: createPaymentSchema }),
  asyncHandler(async (req, res) => {
    const result = await paymentsService.createPayment(
      req.valid.params.id,
      req.body,
      req.user,
    )
    return created(res, result, { dibuatBaru: result.dibuatBaru })
  }),
)

export default router
