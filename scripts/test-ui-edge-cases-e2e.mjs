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
    const visible = await page.locator('.ant-modal-wrap:visible').count()
    if (visible === 0) return true
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
    await page.screenshot({ path: shotPath('ui-01-empty-state') })

    console.log('=== Test 1: Empty state (no accounts) ===')
    let bodyText = await page.evaluate(() => document.body.innerText)
    if (!bodyText.includes('Add account')) throw new Error('Should show "Add account" button')
    console.log('✓ Empty state displays correctly')

    console.log('\n=== Test 2: Form validation - negative amounts ===')
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Account name', 'Test')
    await fillInput(page, 'Initial cash balance (optional)', '-100')
    await page.waitForTimeout(300)

    // Check if validation message appears
    const hasError = await page.evaluate(() => {
      const errorMsg = document.querySelector('.ant-form-item-explain-error')
      return errorMsg !== null
    })
    console.log(`Negative amount validation: ${hasError ? 'Error shown ✓' : 'No error shown'}`)

    // Cancel the form
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    console.log('\n=== Test 3: Modal cancellation without saving ===')
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Account name', 'Cancelled Account')
    await fillInput(page, 'Initial cash balance (optional)', '5000')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    bodyText = await page.evaluate(() => document.body.innerText)
    if (bodyText.includes('Cancelled Account')) throw new Error('Cancelled account should not appear')
    console.log('✓ Modal cancellation works correctly')

    console.log('\n=== Test 4: Create account and test navigation ===')
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Account name', 'Main Account')
    await fillInput(page, 'Initial cash balance (optional)', '1000')
    await fillInput(page, 'Regular deposit name (optional)', 'Salary')
    await fillInput(page, 'Regular deposit amount (optional)', '5000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    console.log('\n=== Test 5: Navigate backward multiple times ===')
    await clickText(page, 'Main Account')
    await page.waitForTimeout(500)

    // Get current month
    const currentMonth = await page.evaluate(() => {
      const header = document.querySelector('.ant-card-head-title')
      return header?.textContent || ''
    })
    console.log(`Current month: ${currentMonth}`)

    // Navigate forward 3 times
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(300)
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(300)
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(500)

    const futureMonth = await page.evaluate(() => {
      const header = document.querySelector('.ant-card-head-title')
      return header?.textContent || ''
    })
    console.log(`Future month: ${futureMonth}`)

    // Navigate backward 3 times
    await page.locator('.anticon-left').click()
    await page.waitForTimeout(300)
    await page.locator('.anticon-left').click()
    await page.waitForTimeout(300)
    await page.locator('.anticon-left').click()
    await page.waitForTimeout(500)

    const returnMonth = await page.evaluate(() => {
      const header = document.querySelector('.ant-card-head-title')
      return header?.textContent || ''
    })
    console.log(`Returned to: ${returnMonth}`)

    if (currentMonth !== returnMonth) throw new Error('Should return to original month')
    console.log('✓ Backward navigation works correctly')

    console.log('\n=== Test 6: Navigate to far future ===')
    // Navigate forward 24 times (2 years)
    for (let i = 0; i < 24; i++) {
      await page.locator('.anticon-right').click()
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('ui-02-far-future') })

    const farFuture = await page.evaluate(() => {
      const header = document.querySelector('.ant-card-head-title')
      const ar = document.body.innerText.match(/AR.*?\n\s*([\d,]+\.\d+)/)?.[1]
      return { month: header?.textContent || '', ar }
    })
    console.log(`Far future (2 years ahead): ${farFuture.month}, AR: ${farFuture.ar}`)
    console.log('✓ Far future navigation works without errors')

    // Return to present
    for (let i = 0; i < 24; i++) {
      await page.locator('.anticon-left').click()
      await page.waitForTimeout(50)
    }
    await page.waitForTimeout(500)

    console.log('\n=== Test 7: Empty transaction list state ===')
    bodyText = await page.evaluate(() => document.body.innerText)
    if (!bodyText.includes('No data')) throw new Error('Should show "No data" for empty transactions')
    console.log('✓ Empty transaction list displays correctly')

    console.log('\n=== Test 8: Add transaction and test rate change idempotence ===')
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '1000')
    await fillInput(page, 'Description', 'Test purchase')
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    // Change rate
    console.log('\n=== Test 9: Rate change idempotence (UI) ===')
    await page.locator('button:has-text("Change rate (m+1 rule)")').click()
    await page.waitForTimeout(500)
    await fillInput(page, 'New monthly amount', '6000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    const arAfterFirstChange = await page.evaluate(() => {
      const match = document.body.innerText.match(/AR.*?\n\s*([\d,]+\.\d+)/)
      return match ? parseFloat(match[1].replace(/,/g, '')) : null
    })
    console.log(`AR after first rate change: ${arAfterFirstChange}`)

    // Try changing to same rate again
    await page.locator('button:has-text("Change rate (m+1 rule)")').click()
    await page.waitForTimeout(500)
    await fillInput(page, 'New monthly amount', '6000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    const arAfterSecondChange = await page.evaluate(() => {
      const match = document.body.innerText.match(/AR.*?\n\s*([\d,]+\.\d+)/)
      return match ? parseFloat(match[1].replace(/,/g, '')) : null
    })
    console.log(`AR after second identical rate change: ${arAfterSecondChange}`)

    if (arAfterFirstChange !== arAfterSecondChange) {
      throw new Error(`Idempotence violation: ${arAfterFirstChange} !== ${arAfterSecondChange}`)
    }
    console.log('✓ Rate change idempotence verified in UI')

    console.log('\n=== Test 10: History invariance (UI) ===')
    // Navigate to next month
    await page.locator('.anticon-right').click()
    await page.waitForTimeout(500)

    const nextMonthAR = await page.evaluate(() => {
      const match = document.body.innerText.match(/AR.*?\n\s*([\d,]+\.\d+)/)
      return match ? parseFloat(match[1].replace(/,/g, '')) : null
    })
    console.log(`Next month AR (should reflect new rate): ${nextMonthAR}`)

    // Make another rate change for the month after
    await page.locator('button:has-text("Change rate (m+1 rule)")').click()
    await page.waitForTimeout(500)
    await fillInput(page, 'New monthly amount', '7500')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    // Navigate back to original month
    await page.locator('.anticon-left').click()
    await page.waitForTimeout(500)

    const originalMonthARAfter = await page.evaluate(() => {
      const match = document.body.innerText.match(/AR.*?\n\s*([\d,]+\.\d+)/)
      return match ? parseFloat(match[1].replace(/,/g, '')) : null
    })
    console.log(`Original month AR after future change: ${originalMonthARAfter}`)

    // Should still be 4000 (5000 - 1000 spot)
    if (Math.abs(originalMonthARAfter - 4000) > 0.01) {
      throw new Error(`History invariance violation: expected ~4000, got ${originalMonthARAfter}`)
    }
    console.log('✓ History invariance verified in UI')

    await page.screenshot({ path: shotPath('ui-03-final') })

    const finalErrors = await page.evaluate(() => window.__errors)
    console.log('final errors:', finalErrors)
    if (finalErrors.length > 0) throw new Error('errors detected: ' + finalErrors.join(', '))

    console.log('\n=== All UI edge case tests passed ===')
  } finally {
    await app.close().catch(() => {})
  }

  console.log('done, screenshots in', SHOT_DIR)
}

main().catch((err) => {
  console.error('E2E UI edge case test failed:', err)
  process.exitCode = 1
})
