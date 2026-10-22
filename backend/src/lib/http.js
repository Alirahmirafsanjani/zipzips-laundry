/**
 * Pembungkus respons HTTP. Semua endpoint memakai bentuk yang sama agar
 * frontend hanya perlu satu interceptor.
 *
 * Bentuk sukses : { "data": ..., "meta": ...? }
 * Bentuk gagal   : { "error": { "code", "message", "details"? } }
 */

export function ok(res, data, meta = undefined) {
  const payload = { data }
  if (meta) payload.meta = meta
  return res.status(200).json(payload)
}

export function created(res, data, meta = undefined) {
  const payload = { data }
  if (meta) payload.meta = meta
  return res.status(201).json(payload)
}

export function noContent(res) {
  return res.status(204).send()
}

export function fail(res, status, code, message, details = undefined) {
  const error = { code, message }
  if (details) error.details = details
  return res.status(status).json({ error })
}

/**
 * Menangkap error async dari handler Express 5 dan meneruskannya ke errorHandler.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
