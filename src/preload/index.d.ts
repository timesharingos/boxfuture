import type { ExposedApi } from './types'

declare global {
  interface Window {
    api: ExposedApi
  }
}
