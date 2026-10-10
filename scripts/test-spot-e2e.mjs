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
    await page.screenshot({ path: shotPath('01-landing') })
    console.log('landing screenshot saved')

    // Create account with initial deposits
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Account name', 'Checking')
    await fillInput(page, 'Initial cash balance (optional)', '10000')
    await fillInput(page, 'Regular deposit name (optional)', 'Salary')
    await fillInput(page, 'Regular deposit amount (optional)', '5000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    const errors = await page.evaluate(() => window.__errors)
    console.log('errors so far:', errors)
    if (errors.length > 0) throw new Error('errors detected: ' + errors.join(', '))

    // Navigate to account
    await clickText(page, 'Checking')
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('02-before-spots') })
    console.log('Before spots: should show cash=10000, AR=5000')

    // Verify initial state
    let bodyText = await page.evaluate(() => document.body.innerText)
    if (!bodyText.includes('10,000.00') || !bodyText.includes('5,000.00')) {
      throw new Error('Initial state incorrect')
    }

    // Test 1: Add spot paid from regular AR (2000)
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    // Should open modal with tabs, Spot tab should be active by default
    await fillInput(page, 'Amount', '2000')
    await fillInput(page, 'Description', 'Purchase 1')
    // Default payment method is 'regular-first'
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('03-after-spot-regular') })
    console.log('After spot from regular: should show cash=10000 (unchanged), AR=3000 (5000-2000)')

    bodyText = await page.evaluate(() => document.body.innerText)
    if (!bodyText.includes('10,000.00')) throw new Error('Cash should still be 10000')
    if (!bodyText.includes('3,000.00')) throw new Error('AR should be 3000 after consuming 2000')

    // Test 2: Add spot paid from one-time cash (1500)
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '1500')
    await fillInput(page, 'Description', 'Purchase 2')
    // Select one-time payment
    await page.locator('.ant-modal-wrap:visible input[value="onetime"]').click()
    await page.waitForTimeout(200)
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('04-after-spot-onetime') })
    console.log('After spot from one-time: should show cash=8500 (10000-1500), AR=3000 (unchanged)')

    bodyText = await page.evaluate(() => document.body.innerText)
    if (!bodyText.includes('8,500.00')) throw new Error('Cash should be 8500 after one-time spot')
    if (!bodyText.includes('3,000.00')) throw new Error('AR should still be 3000')

    // Test 3: Add hybrid spot (4000 = 3000 from regular + 1000 from one-time)
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '4000')
    await fillInput(page, 'Description', 'Big purchase')
    // Default is regular-first, which will use all 3000 AR then 1000 cash
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('05-after-spot-hybrid') })
    console.log('After hybrid spot: should show cash=7500 (8500-1000), AR=0 (3000-3000)')

    bodyText = await page.evaluate(() => document.body.innerText)
    if (!bodyText.includes('7,500.00')) throw new Error('Cash should be 7500 after hybrid spot')

    // Check AR value more carefully - look for the AR statistic specifically
    const arValue = await page.evaluate(() => {
      const stats = [...document.querySelectorAll('.ant-statistic')]
      const arStat = stats.find(s => s.textContent?.includes('AR (this month'))
      if (!arStat) return null
      const valueEl = arStat.querySelector('.ant-statistic-content-value-int')
      return valueEl ? valueEl.textContent : null
    })
    console.log('AR value from page:', arValue)
    if (arValue !== '0') {
      throw new Error(`AR should be 0 after consuming all via hybrid spot, got: ${arValue}`)
    }

    // Verify spots table shows all 3 spots
    if (!bodyText.includes('Purchase 1')) throw new Error('Spot 1 not found in table')
    if (!bodyText.includes('Purchase 2')) throw new Error('Spot 2 not found in table')
    if (!bodyText.includes('Big purchase')) throw new Error('Spot 3 not found in table')

    // Test 4: Navigate to next month and verify settlement
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: shotPath('06-next-month-after-spots') })
    console.log('Next month: October salary (5000) had 2000+3000=5000 consumed, so settled = 0')
    console.log('Cash should be 7500 (no settlement), AR should be 5000 (new month accrual)')

    bodyText = await page.evaluate(() => document.body.innerText)
    // Cash flow should still be 7500 (original 10000 - 1500 one-time - 1000 hybrid-onetime)
    // Plus 0 from October settlement (all AR was consumed by spots)
    if (!bodyText.includes('7,500.00')) throw new Error('Cash should be 7500 in November')
    if (!bodyText.includes('5,000.00')) throw new Error('AR should be 5000 (new month accrual)')

    const finalErrors = await page.evaluate(() => window.__errors)
    console.log('final errors:', finalErrors)
    if (finalErrors.length > 0) throw new Error('errors detected: ' + finalErrors.join(', '))

    console.log('\n=== All E2E spot tests passed ===')
    console.log('done, screenshots in', SHOT_DIR)
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  console.error('E2E test failed:', err)
  process.exit(1)
})
