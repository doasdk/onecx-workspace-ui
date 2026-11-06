import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateCombinedReport } from './combine-allure.mjs'

const encoded = process.env.MATRIX_REPORT_INDEX_BASE64
if (!encoded) throw new Error('Missing matrix report index.')
const entries = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
mkdirSync('results', { recursive: true })
let missing = false
const index = entries.map(({ runId, selection }) => {
  const summaryPath = join('results', runId, 'summary.json')
  if (!existsSync(summaryPath)) {
    missing = true
    console.error(`Missing summary for ${runId}; its job may have failed before producing artifacts.`)
    return { runId, selection, status: 'missing-artifacts' }
  }
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  return {
    runId,
    selection,
    status: summary.status,
    failureStage: summary.failureStage,
    summary: `${runId}/summary.json`,
    report: existsSync(join('results', runId, 'allure-report', 'index.html'))
      ? `${runId}/allure-report/index.html`
      : null
  }
})
writeFileSync(join('results', 'matrix-index.json'), JSON.stringify(index, null, 2))
generateCombinedReport(
  'results',
  entries.map(({ runId }) => runId),
  'integration-tests',
  join('results', 'combined-allure-report')
)
console.table(index.map(({ runId, status, failureStage }) => ({ runId, status, failureStage })))
if (missing) process.exitCode = 1
