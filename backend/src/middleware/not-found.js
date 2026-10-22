import { fail } from '../lib/http.js'

/** Route yang tidak ditemukan. */
export function notFound(req, res) {
  return fail(
    res,
    404,
    'NOT_FOUND',
    `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`,
  )
}

export default notFound
