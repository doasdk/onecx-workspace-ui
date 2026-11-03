import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expandMatrix, loadMatrix } from './matrix.mjs'
import { resolveTestImage } from './test-image-management.mjs'

if (process.platform !== 'linux') {
  throw new Error('Run it:test:matrix inside WSL/Linux, where the Docker daemon is available.')
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
process.chdir(root)
const combinations = expandMatrix(loadMatrix())
const image = resolveTestImage()
execFileSync('docker', ['info'], { stdio: 'ignore' })
await import('./patch-keycloak-startup.mjs')
await import('./patch-service-health.mjs')
await import('./patch-ui-cors.mjs')

const batch = `matrix-${randomUUID()}`
const directory = join(root, 'results', batch)
mkdirSync(directory, { recursive: true })
const results = []
let child
let interrupted
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = signal
    child?.kill(signal)
  })
}
console.log(`Testing ${combinations.length} combinations sequentially with ${image}.`)
for (const [index, selection] of combinations.entries()) {
  if (interrupted) break
  const runId = `${batch}-${index + 1}`
  console.log(`\nCombination ${index + 1}/${combinations.length}: ${JSON.stringify(selection)}`)
  child = spawn(process.execPath, [fileURLToPath(new URL('./run-job.mjs', import.meta.url))], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ENV: 'container',
      E2E_IMAGE: image,
      RUN_ID: runId,
      TEST_SCRIPT: process.env.TEST_SCRIPT || 'tests:gui',
      CAPTURE_PRIVATE_ARTIFACTS: process.env.CAPTURE_PRIVATE_ARTIFACTS || 'true',
      MATRIX_SELECTION_BASE64: Buffer.from(JSON.stringify(selection)).toString('base64')
    }
  })
  const result = await new Promise((resolveResult, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolveResult({ exitCode, signal }))
  })
  child = undefined
  results.push({ runId, selection, ...result })
  writeFileSync(
    join(directory, 'matrix-summary.json'),
    JSON.stringify(
      {
        image,
        total: combinations.length,
        interruptedBy: interrupted,
        results
      },
      null,
      2
    )
  )
  if (result.signal) break
}
console.table(results.map(({ runId, exitCode, signal }) => ({ runId, exitCode, signal })))
console.log(`Matrix summary: results/${batch}/matrix-summary.json`)
process.exitCode = interrupted
  ? interrupted === 'SIGINT'
    ? 130
    : 143
  : results.some(({ exitCode }) => exitCode !== 0)
    ? 1
    : 0
