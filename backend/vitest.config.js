import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/tests/setup.js'],
    // Semua file test berbagi database uji yang sama, jadi harus jalan berurutan
    // agar `resetDatabase()` di satu file tidak menghapus data file lain.
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['src/tests/**', 'prisma/**'],
    },
  },
})
