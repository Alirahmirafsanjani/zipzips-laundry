import config from './config/index.js'
import { createApp } from './app.js'
import { prisma } from './lib/prisma.js'

const app = createApp()

const server = app.listen(config.port, () => {
  console.log(
    `[zipzips-api] berjalan di http://localhost:${config.port} (${config.env})`,
  )
})

/**
 * Shut down yang rapi: tutup HTTP server dulu, baru tutup koneksi database.
 * Render mengirim SIGTERM saat redeploy.
 */
async function shutdown(signal) {
  console.log(`[zipzips-api] menerima ${signal}, menutup server...`)
  server.close(async () => {
    try {
      await prisma.$disconnect()
      console.log('[zipzips-api] koneksi database ditutup.')
    } catch (error) {
      console.error('[zipzips-api] gagal menutup koneksi database:', error)
    }
    process.exit(0)
  })

  // Jangan menggantung selamanya.
  setTimeout(() => {
    console.error('[zipzips-api] force exit setelah timeout.')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  console.error('[zipzips-api] unhandledRejection:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('[zipzips-api] uncaughtException:', error)
  shutdown('uncaughtException')
})
