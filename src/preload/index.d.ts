export interface ExposedApi {
  versions: {
    node: string
    chrome: string
    electron: string
  }
}

declare global {
  interface Window {
    api: ExposedApi
  }
}
