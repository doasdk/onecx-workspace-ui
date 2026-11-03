import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { generateActionsMatrix, generateActionsOutputs } from './generate-matrix.mjs'
import { loadMatrix } from './matrix.mjs'

const env = { E2E_IMAGE: 'registry.example/tests:1' }
const jobs = (selections) => generateActionsMatrix(selections, env).include

test('default version matrix resolves relative to the relocated scripts', () => {
  const expected = JSON.parse(readFileSync(new URL('../versions.json', import.meta.url), 'utf8'))
  assert.deepEqual(loadMatrix({}), expected)
})

test('job names show varying versions and preserve selections', () => {
  const selections = ['3.9.0', '3.10.0-rc.1'].map((version) => ({
    'ui.shell': `ghcr.io/onecx/onecx-shell-ui:${version}`,
    'ui.workspace': 'ghcr.io/onecx/onecx-workspace-ui:main'
  }))
  const generated = jobs(selections)
  assert.deepEqual(
    generated.map(({ name }) => name),
    ['integration-0001 [ui.shell=3.9.0]', 'integration-0002 [ui.shell=3.10.0-rc.1]']
  )
  generated.forEach((job, index) => {
    assert.deepEqual(JSON.parse(Buffer.from(job.selectionBase64, 'base64')), selections[index])
    assert.equal(job.testImage, env.E2E_IMAGE)
  })
})

test('multiple varying components and singleton selections are described', () => {
  const generated = jobs([
    { 'ui.shell': 'example/shell:1', 'bff.shell': 'example/bff:1-native' },
    { 'ui.shell': 'example/shell:2', 'bff.shell': 'example/bff:2-native' }
  ])
  assert.equal(generated[0].name, 'integration-0001 [ui.shell=1, bff.shell=1-native]')
  assert.equal(jobs([{ 'ui.shell': 'example/shell:1' }])[0].name, 'integration-0001 [ui.shell=1]')
})

test('different repositories, registry ports and digests are distinguishable', () => {
  assert.match(
    jobs([{ 'ui.shell': 'registry.example:5000/shell:1' }, { 'ui.shell': 'registry.example:5000/other:1' }])[0].name,
    /ui.shell=registry.example:5000\/shell:1/
  )
  const digest = `sha256:${'a'.repeat(64)}`
  assert.equal(
    jobs([{ 'ui.shell': `registry.example:5000/shell@${digest}` }])[0].name,
    `integration-0001 [ui.shell=${digest}]`
  )
})

test('long display names remain unique and selections are not truncated', () => {
  const selection = { 'ui.shell': `example/shell:${'a'.repeat(300)}` }
  const generated = jobs([selection, selection])
  assert.equal(generated.length, 2)
  assert.ok(generated.every(({ name }) => name.length <= 255))
  assert.notEqual(generated[0].name, generated[1].name)
  assert.notEqual(generated[0].runId, generated[1].runId)
  assert.deepEqual(JSON.parse(Buffer.from(generated[0].selectionBase64, 'base64')), selection)
})

test('Actions outputs preserve the matrix and full report index', () => {
  const selections = [{ 'ui.shell': 'example/shell:1' }]
  const outputs = Object.fromEntries(
    generateActionsOutputs(selections, env)
      .trim()
      .split('\n')
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
  )
  assert.deepEqual(JSON.parse(outputs.matrix), generateActionsMatrix(selections, env))
  assert.deepEqual(JSON.parse(Buffer.from(outputs.report_index, 'base64')), [
    { runId: 'integration-0001', selection: { 'ui.shell': 'example/shell:1' } }
  ])
})

test('Actions matrix enforces the 256-job limit without silently truncating', () => {
  const selection = { 'ui.shell': 'example/shell:1' }
  assert.equal(jobs(Array(256).fill(selection)).length, 256)
  assert.throws(() => jobs(Array(257).fill(selection)), /1 to 256/)
  assert.throws(() => jobs([]), /1 to 256/)
})

test('oversized Actions job outputs fail explicitly', () => {
  const selection = { 'ui.shell': `example/shell:${'a'.repeat(2000)}` }
  assert.throws(() => generateActionsOutputs(Array(256).fill(selection), env), /1 MB job-output limit/)
})

test('CLI writes GitHub outputs and combinations without requiring dependencies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'onecx-matrix-test-'))
  try {
    const output = join(directory, 'github-output')
    writeFileSync(output, '')
    execFileSync(process.execPath, [fileURLToPath(new URL('./generate-matrix.mjs', import.meta.url))], {
      cwd: directory,
      env: {
        ...process.env,
        ...env,
        GITHUB_OUTPUT: output,
        VERSION_MATRIX_JSON: JSON.stringify({ 'ui.shell': ['example/shell:1', 'example/shell:2'] })
      }
    })
    const combinations = JSON.parse(readFileSync(join(directory, '.generated', 'combinations.json'), 'utf8'))
    assert.equal(combinations.length, 2)
    assert.equal(readFileSync(output, 'utf8'), generateActionsOutputs(combinations, env))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
