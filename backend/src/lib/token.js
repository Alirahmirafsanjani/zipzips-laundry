import jwt from 'jsonwebtoken'
import config from '../config/index.js'

/**
 * Token JWT stateless.
 *
 * Payload sengaja diminimalkan (id, username, role) supaya token tetap kecil
 * dan tidak berisi data sensitif. Perubahan role/status user berlaku setelah
 * token berikutnya diterbitkan (maks. 12 jam) — untuk MVP ini diterima.
 */

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      nama: user.nama,
    },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  )
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret)
}

export function tokenPayload(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    nama: user.nama,
  }
}
