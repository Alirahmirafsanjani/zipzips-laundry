import { Router } from 'express'
import { ok } from '../../lib/http.js'

const router = Router()

/**
 * Health check TANPA query database.
 * Dipakai Render untuk menentukan service hidup, dan dipakai keep-alive pinger.
 * Sengaja tidak menyentuh DB supaya tetap responsif walau pooler sesaat bermasalah.
 */
router.get('/', (req, res) => {
  return ok(res, {
    status: 'ok',
    service: 'zipzips-api',
    env: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

export default router
