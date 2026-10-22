/**
 * Error domain yang bisa diprediksi. Dipakai service layer agar
 * errorHandler bisa memetakan ke status HTTP yang tepat.
 */
export class HttpError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }

  static badRequest(message, details) {
    return new HttpError(400, 'BAD_REQUEST', message, details)
  }

  static unauthorized(message = 'Anda harus masuk terlebih dahulu') {
    return new HttpError(401, 'UNAUTHORIZED', message)
  }

  static forbidden(message = 'Anda tidak memiliki akses untuk aksi ini') {
    return new HttpError(403, 'FORBIDDEN', message)
  }

  static notFound(message = 'Data tidak ditemukan') {
    return new HttpError(404, 'NOT_FOUND', message)
  }

  static conflict(code, message) {
    return new HttpError(409, code, message)
  }

  static unprocessable(code, message, details) {
    return new HttpError(422, code, message, details)
  }
}

export default HttpError
