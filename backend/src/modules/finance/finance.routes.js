import { Router } from 'express'
import { ok, created, asyncHandler } from '../../lib/http.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { requireOwner } from '../../middleware/authorize.js'
import {
  createExpenseSchema,
  createOtherIncomeSchema,
  rangeQuerySchema,
  listExpenseQuerySchema,
  listOtherIncomeQuerySchema,
} from './finance.schema.js'
import * as financeService from './finance.service.js'

const router = Router()

router.use(requireAuth)
// Laporan keuangan hanya untuk pemilik.
router.use(requireOwner)

router.get(
  '/ringkasan',
  validate({ query: rangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await financeService.ringkasan(req.valid.query)
    return ok(res, result)
  }),
)

/** Alias laporan: sama dengan ringkasan, namun diberi nama eksplisit. */
router.get(
  '/laba-rugi',
  validate({ query: rangeQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await financeService.ringkasan(req.valid.query)
    return ok(res, result)
  }),
)

router.get(
  '/pengeluaran',
  validate({ query: listExpenseQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await financeService.listExpenses(req.valid.query)
    return ok(res, result.items, result.meta)
  }),
)

router.post(
  '/pengeluaran',
  validate({ body: createExpenseSchema }),
  asyncHandler(async (req, res) => {
    const expense = await financeService.createExpense(req.body, req.user)
    return created(res, expense)
  }),
)

router.get(
  '/pemasukan-lain',
  validate({ query: listOtherIncomeQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await financeService.listOtherIncomes(req.valid.query)
    return ok(res, result.items, result.meta)
  }),
)

router.post(
  '/pemasukan-lain',
  validate({ body: createOtherIncomeSchema }),
  asyncHandler(async (req, res) => {
    const income = await financeService.createOtherIncome(req.body, req.user)
    return created(res, income)
  }),
)

router.get(
  '/ekspor/pengeluaran.csv',
  validate({ query: listExpenseQuerySchema }),
  asyncHandler(async (req, res) => {
    const result = await financeService.listExpenses({ ...req.valid.query, limit: 10000 })
    const csv = financeService.toCsv(result.items, [
      { key: 'tanggal', label: 'Tanggal' },
      { key: 'kategori', label: 'Kategori' },
      { key: 'keterangan', label: 'Keterangan' },
      { key: 'nominal', label: 'Nominal' },
      { key: 'metodeBayar', label: 'Metode' },
    ])
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="pengeluaran.csv"')
    return res.send(csv)
  }),
)

export default router
