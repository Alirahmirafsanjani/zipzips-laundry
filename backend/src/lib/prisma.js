import { PrismaClient } from '@prisma/client'
import config from '../config/index.js'

/**
 * Satu instance PrismaClient per proses.
 * Disimpan di globalThis agar tidak tercipta ulang saat hot-reload (nodemon).
 */
const globalForPrisma = globalThis

export const prisma =
  globalForPrisma.__zipzipsPrisma ||
  new PrismaClient({
    log: config.isDev ? ['warn', 'error'] : ['error'],
  })

if (!globalForPrisma.__zipzipsPrisma) {
  globalForPrisma.__zipzipsPrisma = prisma
}

export default prisma
