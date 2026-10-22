import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'

import config from './config/index.js'
import { notFound } from './middleware/not-found.js'
import { errorHandler } from './middleware/error-handler.js'

import healthRoutes from './modules/health/health.routes.js'
import authRoutes from './modules/auth/auth.routes.js'
import userRoutes from './modules/users/users.routes.js'
import serviceRoutes from './modules/services/services.routes.js'
import orderRoutes from './modules/orders/orders.routes.js'
import paymentRoutes from './modules/payments/payments.routes.js'
import customerRoutes from './modules/customers/customers.routes.js'
import inventoryRoutes from './modules/inventory/inventory.routes.js'
import financeRoutes from './modules/finance/finance.routes.js'
import dashboardRoutes from './modules/dashboard/dashboard.routes.js'
import settingRoutes from './modules/settings/settings.routes.js'
import auditRoutes from './modules/audit/audit.routes.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  // Render/reverse proxy ada di depan app → IP asli dibutuhkan untuk rate limit & log.
  app.set('trust proxy', 1)

  app.use(
    helmet({
      // API murni JSON; CSP tidak relevan karena frontend di origin terpisah.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true)
        if (config.cors.allowAll || config.cors.origins.includes(origin)) {
          return callback(null, true)
        }
        return callback(new Error('Origin tidak diizinkan'))
      },
      credentials: false,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  app.use(express.json({ limit: '1mb' }))

  // Rate limit global yang longgar — protects dari abuse tanpa mengganggu kasir.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.isProd ? 300 : 5000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Terlalu banyak permintaan. Mohon tunggu sebentar.',
        },
      },
    }),
  )

  app.use('/api/health', healthRoutes)
  app.use('/api/auth', authRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/services', serviceRoutes)
  app.use('/api/orders', orderRoutes)
  app.use('/api/payments', paymentRoutes)
  app.use('/api/customers', customerRoutes)
  app.use('/api/inventory', inventoryRoutes)
  app.use('/api/finance', financeRoutes)
  app.use('/api/dashboard', dashboardRoutes)
  app.use('/api/settings', settingRoutes)
  app.use('/api/audit', auditRoutes)

  app.use(notFound)
  app.use(errorHandler)

  return app
}

export default createApp
