import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs'

const APP_DIR = path.resolve(import.meta.dirname, '..')
const SHOT_DIR = path.join(APP_DIR, 'scripts', '.shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

function shotPath(name) {
  return path.join(SHOT_DIR, `${name}.png`)
}

async function clickText(page, text) {
  const result = await page.evaluate((t) => {
    function isVisible(el) {
      if (!(el instanceof HTMLElement)) return false
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    const els = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"], li')].filter(
      isVisible
    )
    const el = els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t))
    if (!el) return 'NOT_FOUND'
    el.click()
    return 'OK'
  }, text)
  console.log(`click-text "${text}" ->`, result)
  if (result === 'NOT_FOUND') throw new Error(`click-text not found: ${text}`)
}

async function fillInput(page, label, value) {
  const item = page
    .locator('.ant-modal-wrap:visible .ant-form-item')
    .filter({ has: page.locator('.ant-form-item-label', { hasText: label }) })
  const input = item.locator('input').first()
  await input.waitFor({ state: 'visible', timeout: 5000 })
  await input.fill(String(value))
  console.log(`fill "${label}" = "${value}" -> OK`)
}

async function waitForBodyText(page, text, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const found = await page.evaluate((t) => document.body.innerText.includes(t), text)
    if (found) return true
    await page.waitForTimeout(150)
  }
  throw new Error(`timed out waiting for text: ${text}`)
}

async function waitForModalClosed(page, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const open = await page.evaluate(() => !!document.querySelector('.ant-modal-wrap:not([style*="display: none"])'))
    if (!open) return true
    await page.waitForTimeout(150)
  }
  throw new Error('timed out waiting for modal to close')
}

async function main() {
  const electronBin = path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe')
  const app = await electron.launch({
    executablePath: electronBin,
    args: [APP_DIR],
    timeout: 30000
  })

  app.process().stdout.on('data', (d) => process.stdout.write(`[main stdout] ${d}`))
  app.process().stderr.on('data', (d) => process.stdout.write(`[main stderr] ${d}`))

  try {
    const page = await app.firstWindow()
    page.on('console', (msg) => console.log(`[renderer console:${msg.type()}]`, msg.text()))
    page.on('pageerror', (err) => console.log('[renderer pageerror]', err?.stack || err?.message || JSON.stringify(err)))
    await page.waitForLoadState('domcontentloaded')
    await page.evaluate(() => {
      window.__errors = []
      window.addEventListener('error', (e) => window.__errors.push('error: ' + (e.error?.stack || e.message)))
      window.addEventListener('unhandledrejection', (e) => {
        let reason = e.reason
        try {
          reason = reason?.stack || reason?.message || JSON.stringify(reason)
        } catch {
          reason = String(reason)
        }
        window.__errors.push('rejection: ' + reason)
      })
    })
    await waitForBodyText(page, 'Balance Tracker')

    await page.screenshot({ path: shotPath('01-landing') })
    console.log('landing screenshot saved')

    // Add account
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Name', 'Checking')
    await clickText(page, 'OK')
    await page.waitForTimeout(1000)
    console.log('errors so far:', await page.evaluate(() => window.__errors))
    await waitForModalClosed(page)
    await waitForBodyText(page, 'Checking')

    await page.screenshot({ path: shotPath('02-after-add-account') })

    // Select the new account in the sidebar
    await clickText(page, 'Checking')
    await waitForBodyText(page, 'Cash Flow')
    await page.screenshot({ path: shotPath('03-account-selected') })

    // Add one-time deposit
    await clickText(page, 'Add one-time deposit')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '1000')
    await fillInput(page, 'Description', 'Bonus')
    await clickText(page, 'OK')
    await page.waitForTimeout(1000)
    console.log('errors after one-time deposit:', await page.evaluate(() => window.__errors))
    await waitForModalClosed(page)
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('04-after-one-time-deposit') })

    // Add regular deposit
    await clickText(page, 'Add regular deposit')
    await page.waitForTimeout(300)
    await fillInput(page, 'Name', 'Salary')
    await fillInput(page, 'Monthly amount', '5000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('05-after-regular-deposit') })

    const bodyText = await page.evaluate(() => document.body.innerText)
    console.log('--- page text snapshot ---')
    console.log(bodyText)

    // Navigate forward one month: October's salary should settle into cash flow,
    // and AR should reset to the new (November) accrual.
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: shotPath('06-next-month') })
    const nextMonthText = await page.evaluate(() => document.body.innerText)
    console.log('--- next month text snapshot ---')
    console.log(nextMonthText)
  } finally {
    await app.close().catch(() => {})
  }

  console.log('done, screenshots in', SHOT_DIR)
}

main().catch((err) => {
  console.error('E2E FAILED:', err)
  process.exitCode = 1
})
