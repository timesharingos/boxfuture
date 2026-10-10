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
    timeout: 30000,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined
    }
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
      window.addEventListener('error', (e) => window.__errors.push(e.message))
      window.addEventListener('unhandledrejection', (e) => window.__errors.push(e.reason?.message || String(e.reason)))
    })

    await page.waitForTimeout(1000)
    await page.screenshot({ path: shotPath('m1-01-landing') })

    // Create account with regular deposit
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Account name', 'Test Account')
    await fillInput(page, 'Initial cash balance (optional)', '1000')
    await fillInput(page, 'Regular deposit name (optional)', 'Salary')
    await fillInput(page, 'Regular deposit amount (optional)', '5000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await clickText(page, 'Test Account')
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('m1-02-initial-state') })

    // Verify initial AR is 5000
    let bodyText = await page.evaluate(() => document.body.innerText)
    console.log('=== October (initial month) ===')
    console.log('Expected: AR = 5000')
    if (!bodyText.includes('5,000.00')) throw new Error('Initial AR should be 5000')

    // Change rate to 6000 (should take effect in m+1)
    console.log('=== Changing rate to 6000 ===')
    // Use Playwright locator for the button instead of clickText
    await page.locator('button:has-text("Change rate (m+1 rule)")').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('m1-02b-modal-opened') })
    await fillInput(page, 'New monthly amount', '6000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('m1-03-after-rate-change') })

    // Verify AR is still 5000 in current month (October)
    bodyText = await page.evaluate(() => document.body.innerText)
    console.log('=== October (after rate change) ===')
    console.log('Expected: AR still = 5000 (rate change is m+1)')
    if (!bodyText.includes('5,000.00')) throw new Error('AR should still be 5000 in October')

    // Navigate to next month (November)
    console.log('=== Navigating to November ===')
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: shotPath('m1-04-next-month') })

    // Verify new rate takes effect (AR = 6000)
    bodyText = await page.evaluate(() => document.body.innerText)
    console.log('Expected: AR = 6000 (new rate takes effect)')
    if (!bodyText.includes('6,000.00')) throw new Error('AR should be 6000 in November (new rate)')

    // Verify cash flow includes settled October salary (5000)
    const cashFlow = await page.evaluate(() => {
      const stats = [...document.querySelectorAll('.ant-statistic')]
      const cashStat = stats.find(s => s.textContent?.includes('Cash Flow'))
      if (!cashStat) return null
      const valueEl = cashStat.querySelector('.ant-statistic-content-value-int')
      return valueEl ? parseFloat(valueEl.textContent.replace(',', '')) : null
    })
    console.log('Cash flow in November:', cashFlow)
    console.log('Expected: 1000 (initial) + 5000 (October settled) = 6000')
    if (cashFlow !== 6000) throw new Error(`Cash flow should be 6000, got ${cashFlow}`)

    // Navigate to December to verify rate persists
    console.log('=== Navigating to December ===')
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: shotPath('m1-05-december') })

    bodyText = await page.evaluate(() => document.body.innerText)
    console.log('Expected: AR = 6000 (rate persists)')
    if (!bodyText.includes('6,000.00')) throw new Error('AR should still be 6000 in December')

    const finalErrors = await page.evaluate(() => window.__errors)
    console.log('final errors:', finalErrors)
    if (finalErrors.length > 0) throw new Error('errors detected: ' + finalErrors.join(', '))

    console.log('\n=== All m+1 rule tests passed ===')
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  console.error('E2E test failed:', err)
  process.exit(1)
})
