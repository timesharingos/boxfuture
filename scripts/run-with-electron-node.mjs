import { spawnSync } from 'node:child_process'
import path from 'node:path'

const APP_DIR = path.resolve(import.meta.dirname, '..')
const electronBin = path.join(
  APP_DIR,
  'node_modules',
  'electron',
  'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron'
)

const args = process.argv.slice(2)
const result = spawnSync(electronBin, ['--experimental-strip-types', ...args], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

process.exit(result.status ?? 1)
