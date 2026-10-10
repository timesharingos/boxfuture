import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs'

const APP_DIR = path.resolve(import.meta.dirname, '..')
const SHOT_DIR = path.join(APP_DIR, 'scripts', '.shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

function shotPath(name) {
  return path.join(SHOT_DIR, `${name}.png`)
}

async function fillDate(page, dateString) {
  // Clear the input first
  const dateInput = page.locator('.ant-modal-wrap:visible .ant-picker input')
  await dateInput.click()
  await dateInput.fill('')
  await page.waitForTimeout(100)

  // Fill the date
  await dateInput.fill(dateString)
  await page.waitForTimeout(200)

  // Press Enter to confirm the date
  await dateInput.press('Enter')
  await page.waitForTimeout(200)
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
    await page.screenshot({ path: shotPath('sort-01-landing') })

    // Create account with initial deposits
    await clickText(page, 'Add account')
    await page.waitForTimeout(300)
    await fillInput(page, 'Account name', 'Test Account')
    await fillInput(page, 'Initial cash balance (optional)', '10000')
    await fillInput(page, 'Regular deposit name (optional)', 'Salary')
    await fillInput(page, 'Regular deposit amount (optional)', '5000')
    await clickText(page, 'OK')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await clickText(page, 'Test Account')
    await page.waitForTimeout(500)

    // Add multiple spots with different dates and amounts for sorting tests
    console.log('=== Adding spot 1: $500 on Oct 5 ===')
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '500')
    await fillDate(page, '2026-10-05')
    await fillInput(page, 'Description', 'Groceries')
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    console.log('=== Adding spot 2: $1500 on Oct 3 ===')
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '1500')
    await fillDate(page, '2026-10-03')
    await fillInput(page, 'Description', 'Rent')
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    console.log('=== Adding spot 3: $200 on Oct 7 ===')
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '200')
    await fillDate(page, '2026-10-07')
    await fillInput(page, 'Description', 'Coffee')
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    console.log('=== Adding spot 4: $3000 on Oct 1 ===')
    await clickText(page, 'Add transaction')
    await page.waitForTimeout(300)
    await fillInput(page, 'Amount', '3000')
    await fillDate(page, '2026-10-01')
    await fillInput(page, 'Description', 'Car payment')
    await clickText(page, 'Add Spot')
    await waitForModalClosed(page)
    await page.waitForTimeout(500)

    await page.screenshot({ path: shotPath('sort-02-all-transactions-added') })

    // Test sorting by date (default: ascending)
    console.log('=== Test 1: Sort by date ascending (default) ===')
    let rows = await page.evaluate(() => {
      const table = document.querySelector('.ant-table-tbody')
      if (!table) return []
      return [...table.querySelectorAll('tr')].map(tr => {
        const cells = [...tr.querySelectorAll('td')]
        return {
          date: cells[1]?.innerText || '',
          description: cells[2]?.innerText || '',
          amount: cells[3]?.innerText || ''
        }
      })
    })
    console.log('Rows (date asc):', rows)
    if (rows[0].date !== '2026-10-01') throw new Error('First row should be 2026-10-01')
    if (rows[3].date !== '2026-10-07') throw new Error('Last row should be 2026-10-07')

    // Test sorting by date descending
    console.log('=== Test 2: Sort by date descending ===')
    await page.locator('.ant-select').nth(1).click() // Click order dropdown
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('sort-02b-dropdown-opened') })
    // Use Playwright's locator for dropdown options
    await page.locator('.ant-select-item-option-content:has-text("Desc")').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('sort-03-date-desc') })

    rows = await page.evaluate(() => {
      const table = document.querySelector('.ant-table-tbody')
      if (!table) return []
      return [...table.querySelectorAll('tr')].map(tr => {
        const cells = [...tr.querySelectorAll('td')]
        return {
          date: cells[1]?.innerText || '',
          amount: cells[3]?.innerText || ''
        }
      })
    })
    console.log('Rows (date desc):', rows)
    if (rows[0].date !== '2026-10-07') throw new Error('First row should be 2026-10-07 (latest)')
    if (rows[3].date !== '2026-10-01') throw new Error('Last row should be 2026-10-01 (earliest)')

    // Test sorting by amount ascending
    console.log('=== Test 3: Sort by amount ascending ===')
    await page.locator('.ant-select').nth(0).click() // Click field dropdown
    await page.waitForTimeout(500)
    await page.locator('.ant-select-item-option-content:has-text("Amount")').click()
    await page.waitForTimeout(200)
    await page.locator('.ant-select').nth(1).click() // Click order dropdown
    await page.waitForTimeout(500)
    await page.locator('.ant-select-item-option-content:has-text("Asc")').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('sort-04-amount-asc') })

    rows = await page.evaluate(() => {
      const table = document.querySelector('.ant-table-tbody')
      if (!table) return []
      return [...table.querySelectorAll('tr')].map(tr => {
        const cells = [...tr.querySelectorAll('td')]
        return {
          description: cells[2]?.innerText || '',
          amount: parseFloat(cells[3]?.innerText || '0')
        }
      })
    })
    console.log('Rows (amount asc):', rows)
    if (rows[0].amount !== 200) throw new Error('First row should be 200 (smallest)')
    if (rows[3].amount !== 3000) throw new Error('Last row should be 3000 (largest)')

    // Test sorting by amount descending
    console.log('=== Test 4: Sort by amount descending ===')
    await page.locator('.ant-select').nth(1).click() // Click order dropdown
    await page.waitForTimeout(500)
    await page.locator('.ant-select-item-option-content:has-text("Desc")').click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath('sort-05-amount-desc') })

    rows = await page.evaluate(() => {
      const table = document.querySelector('.ant-table-tbody')
      if (!table) return []
      return [...table.querySelectorAll('tr')].map(tr => {
        const cells = [...tr.querySelectorAll('td')]
        return {
          description: cells[2]?.innerText || '',
          amount: parseFloat(cells[3]?.innerText || '0')
        }
      })
    })
    console.log('Rows (amount desc):', rows)
    if (rows[0].amount !== 3000) throw new Error('First row should be 3000 (largest)')
    if (rows[3].amount !== 200) throw new Error('Last row should be 200 (smallest)')

    // Test unified transaction list shows all transactions
    console.log('=== Test 5: Verify all transactions in unified list ===')
    const allRows = await page.evaluate(() => {
      const table = document.querySelector('.ant-table-tbody')
      if (!table) return []
      return [...table.querySelectorAll('tr')].length
    })
    console.log('Total rows in table:', allRows)
    if (allRows !== 4) throw new Error(`Expected 4 transactions, got ${allRows}`)

    // Verify transaction type tags
    const typeTags = await page.evaluate(() => {
      const table = document.querySelector('.ant-table-tbody')
      if (!table) return []
      // Get the Type column (first column with tags)
      const rows = [...table.querySelectorAll('tr')]
      return rows.map(row => {
        const typeCell = row.querySelector('td:first-child .ant-tag')
        return typeCell?.innerText || ''
      })
    })
    console.log('Type tags:', typeTags)
    if (!typeTags.every(tag => tag === 'spot')) throw new Error('All type tags should be "spot"')

    const finalErrors = await page.evaluate(() => window.__errors)
    console.log('final errors:', finalErrors)
    if (finalErrors.length > 0) throw new Error('errors detected: ' + finalErrors.join(', '))

    console.log('\n=== All sorting and unified list tests passed ===')
  } finally {
    await app.close()
  }
}

main().catch((err) => {
  console.error('E2E test failed:', err)
  process.exit(1)
})
