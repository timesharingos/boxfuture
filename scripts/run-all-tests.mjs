#!/usr/bin/env node

/**
 * Run all unit tests and E2E tests in sequence
 * Exits with code 1 if any test fails
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { homedir } from 'os'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

const unitTests = [
  { name: 'Ledger Tests', script: 'test:ledger' },
  { name: 'Spot Ledger Tests', script: 'test:spot' },
  { name: 'Edge Cases Tests', script: 'test:edge-cases' },
  { name: 'Property Invariants Tests', script: 'test:property' }
]

const e2eTests = [
  { name: 'E2E Smoke Test', script: 'test:e2e' },
  { name: 'E2E Spot Test', script: 'test:spot-e2e' },
  { name: 'E2E Sorting Test', script: 'test:sorting-e2e' },
  { name: 'E2E M+1 Rule Test', script: 'test:m1-rule-e2e' },
  { name: 'E2E UI Edge Cases Test', script: 'test:ui-edge-cases-e2e' }
]

let allPassed = true
let totalTests = 0
let passedTests = 0
const results = []

function cleanDatabase() {
  const dbPath = join(homedir(), 'AppData', 'Roaming', 'boxfutures', 'data.db')
  const walPath = dbPath + '-wal'
  const shmPath = dbPath + '-shm'

  const files = [dbPath, walPath, shmPath]
  let cleaned = false

  for (const file of files) {
    if (existsSync(file)) {
      try {
        unlinkSync(file)
        cleaned = true
      } catch (err) {
        console.warn(`Warning: Could not delete ${file}:`, err.message)
      }
    }
  }

  if (cleaned) {
    console.log('✓ Database cleaned\n')
  }
}

async function runTest(testName, scriptName, cleanDbBefore = false) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Running: ${testName}`)
    console.log('='.repeat(60))

    if (cleanDbBefore) {
      cleanDatabase()
    }

    const startTime = Date.now()
    const proc = spawn('npm', ['run', scriptName], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit'
    })

    proc.on('close', (code) => {
      const duration = Date.now() - startTime
      const passed = code === 0

      results.push({
        name: testName,
        passed,
        duration,
        code
      })

      if (passed) {
        passedTests++
      } else {
        allPassed = false
      }

      totalTests++
      resolve(passed)
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  const runE2E = args.includes('--e2e') || args.includes('--all')
  const runUnit = args.includes('--unit') || !args.includes('--e2e')

  console.log('\n' + '█'.repeat(60))
  console.log('  BOXFUTURES - RUNNING TESTS')
  console.log('█'.repeat(60))

  if (runUnit) {
    console.log('\n' + '─'.repeat(60))
    console.log('  UNIT TESTS')
    console.log('─'.repeat(60))

    for (const test of unitTests) {
      await runTest(test.name, test.script)
    }
  }

  if (runE2E) {
    console.log('\n' + '─'.repeat(60))
    console.log('  E2E TESTS (Building first...)')
    console.log('─'.repeat(60))

    for (const test of e2eTests) {
      // Clean database before each E2E test to ensure clean state
      await runTest(test.name, test.script, true)
    }
  }

  // Print summary
  console.log('\n\n' + '█'.repeat(60))
  console.log('  TEST SUMMARY')
  console.log('█'.repeat(60) + '\n')

  results.forEach((result, index) => {
    const status = result.passed ? '✓ PASS' : '✗ FAIL'
    const statusColor = result.passed ? '\x1b[32m' : '\x1b[31m'
    const resetColor = '\x1b[0m'
    const duration = `${(result.duration / 1000).toFixed(1)}s`

    console.log(
      `${index + 1}. ${statusColor}${status}${resetColor} - ${result.name} (${duration})`
    )
  })

  console.log('\n' + '-'.repeat(60))
  console.log(
    `Total: ${passedTests}/${totalTests} tests passed`
  )
  console.log('-'.repeat(60) + '\n')

  if (allPassed) {
    console.log('\x1b[32m✓ All tests passed!\x1b[0m\n')
    process.exit(0)
  } else {
    console.log('\x1b[31m✗ Some tests failed!\x1b[0m\n')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Error running tests:', err)
  process.exit(1)
})
