import { ZodError } from 'zod'
import { fail } from '../lib/http.js'

/**
 * Validasi input berbasis Zod.
 *
 * CATATAN PENTING (Express 5): `req.query` adalah getter — tidak bisa di-assign.
 * Karena itu hasil parse disimpan di `req.valid.query` / `req.valid.params`.
 * `req.body` tetap bisa di-assign dan dipakai langsung.
 *
 * Contoh:
 *   router.post('/', validate({ body: createOrderSchema }), handler)
 */
export function validate(schemas = {}) {
  return function validateMiddleware(req, res, next) {
    try {
      req.valid = req.valid || {}

      if (schemas.body) {
        req.body = schemas.body.parse(req.body ?? {})
        req.valid.body = req.body
      }

      if (schemas.query) {
        const parsed = schemas.query.parse(req.query ?? {})
        req.valid.query = parsed
      }

      if (schemas.params) {
        const parsed = schemas.params.parse(req.params ?? {})
        req.valid.params = parsed
      }

      return next()
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
          code: issue.code,
        }))
        return fail(
          res,
          422,
          'VALIDATION_ERROR',
          'Data yang dikirim tidak valid.',
          details,
        )
      }
      return next(error)
    }
  }
}

export default validate
