/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_STORE_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
