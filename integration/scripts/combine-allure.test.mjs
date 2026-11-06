import assert from 'node:assert/strict'
import test from 'node:test'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateCombinedReport, mergeAllureResults } from './combine-allure.mjs'

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'onecx-allure-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const target = join(root, 'merged')
  const writeRun = (runId, results, versions) => {
    const directory = join(root, runId, 'allure-results')
    mkdirSync(directory, { recursive: true })
    for (const [file, result] of Object.entries(results)) {
      writeFileSync(join(directory, file), JSON.stringify(result))
    }
    if (versions !== undefined) writeFileSync(join(root, runId, 'versions.json'), JSON.stringify(versions))
    return directory
  }
  const readResult = (name) => JSON.parse(readFileSync(join(target, name), 'utf8'))
  return { root, target, writeRun, readResult }
}

const provenance = {
  runnerVersion: '1.0.0',
  images: {
    'ui.shell': {
      requested: 'registry.example/shell:1',
      resolved: 'registry.example/shell@sha256:abc',
      imageId: 'sha256:def',
      verified: true
    }
  }
}

test('should replace all suite labels when merging a Playwright result', (t) => {
  const { root, target, writeRun, readResult } = setup(t)
  writeRun(
    'run-1',
    {
      'test-result.json': {
        labels: [
          { name: 'parentSuite', value: 'chromium' },
          { name: 'parentSuite', value: 'duplicate' },
          { name: 'suite', value: 'initial.spec.ts' },
          { name: 'subSuite', value: 'Workspace' },
          { name: 'tag', value: 'gui' }
        ],
        parameters: [{ name: 'Project', value: 'firefox' }],
        fullName: 'initial.spec.ts > Workspace > test'
      }
    },
    provenance
  )
  mergeAllureResults(root, ['run-1'], target)
  assert.deepEqual(readResult('test-result.json').labels, [
    { name: 'tag', value: 'gui' },
    { name: 'parentSuite', value: 'integration-job-0001' },
    { name: 'suite', value: 'firefox' }
  ])
})

test('should show only requested component versions when adding version details', (t) => {
  const { root, target, writeRun, readResult } = setup(t)
  writeRun(
    'run-1',
    {
      'test-result.json': {
        labels: [{ name: 'parentSuite', value: 'chromium' }],
        parameters: [{ name: 'unrelated', value: 'value' }],
        description: 'Original description',
        fullName: 'initial.spec.ts > Workspace > test',
        attachments: [{ name: 'screenshot', source: 'screenshot.png', type: 'image/png' }]
      }
    },
    provenance
  )
  mergeAllureResults(root, ['run-1'], target)
  const result = readResult('test-result.json')
  assert.equal(result.fullName, 'initial.spec.ts > Workspace > test')
  assert.equal(
    result.description,
    'Original description\n\nComponent versions:\n```json\n{\n  "ui.shell": "registry.example/shell:1"\n}\n```'
  )
  assert.deepEqual(result.attachments, [
    { name: 'screenshot', source: 'screenshot.png', type: 'image/png' },
    { name: 'versions.json', source: 'integration-job-0001-versions.json', type: 'application/json' }
  ])
  assert.deepEqual(JSON.parse(readFileSync(join(target, result.attachments[1].source), 'utf8')), provenance)
})

test('should append escaped provenance when the test uses an HTML description', (t) => {
  const { root, target, writeRun, readResult } = setup(t)
  writeRun(
    'run-1',
    {
      'test-result.json': {
        parameters: [{ name: 'Project', value: 'webkit' }],
        descriptionHtml: '<p>Original HTML</p>'
      }
    },
    { images: { 'ui.shell': { requested: 'registry.example/shell:<&>' } } }
  )
  mergeAllureResults(root, ['run-1'], target)
  assert.match(readResult('test-result.json').descriptionHtml, /^<p>Original HTML<\/p><pre>/)
  assert.match(readResult('test-result.json').descriptionHtml, /&lt;&amp;&gt;/)
})

test('should retain matrix positions when an earlier job has no results', (t) => {
  const { root, target, writeRun, readResult } = setup(t)
  const warnings = t.mock.method(console, 'warn', () => {})
  writeRun('run-2', {
    'test-result.json': { labels: [{ name: 'parentSuite', value: 'webkit' }] }
  })
  mergeAllureResults(root, ['missing', 'run-2'], target)
  const result = readResult('test-result.json')
  assert.equal(result.labels[0].value, 'integration-job-0002')
  assert.match(result.description, /versions.json is missing/)
  assert.equal(result.attachments, undefined)
  assert.equal(warnings.mock.callCount(), 2)
})

test('should fail explicitly when no browser can be determined', (t) => {
  const { root, target, writeRun } = setup(t)
  writeRun('run-1', { 'test-result.json': {} }, provenance)
  assert.throws(() => mergeAllureResults(root, ['run-1'], target), /Missing Playwright project\/browser/)
})

test('should fail explicitly when version provenance is malformed', (t) => {
  const { root, target, writeRun } = setup(t)
  writeRun('run-1', {}, provenance)
  writeFileSync(join(root, 'run-1', 'versions.json'), 'invalid')
  assert.throws(() => mergeAllureResults(root, ['run-1'], target), SyntaxError)
})

test('should remove stale merged results when rebuilding an empty matrix', (t) => {
  const { root, target } = setup(t)
  mkdirSync(target)
  writeFileSync(join(target, 'stale-result.json'), '{}')
  assert.equal(mergeAllureResults(root, [], target), false)
  assert.deepEqual(readdirSync(target), [])
})

test('should skip report generation when the run contains only auxiliary files', (t) => {
  const { root, writeRun } = setup(t)
  writeRun('run-1', { 'executor.json': { name: 'CI' } }, provenance)
  const report = join(root, 'report')
  assert.equal(generateCombinedReport(root, ['run-1'], root, report), false)
  assert.equal(existsSync(report), false)
})

test('should keep jobs distinct and retries together when assigning test identities', (t) => {
  const { root, target, writeRun, readResult } = setup(t)
  for (const runId of ['run-1', 'run-2']) {
    writeRun(
      runId,
      Object.fromEntries(
        ['first', 'retry'].map((attempt) => [
          `${runId}-${attempt}-result.json`,
          {
            labels: [{ name: 'parentSuite', value: 'chromium' }],
            historyId: 'same-history',
            testCaseId: 'same-case'
          }
        ])
      ),
      provenance
    )
  }
  mergeAllureResults(root, ['run-1', 'run-2'], target)
  for (const runId of ['run-1', 'run-2']) {
    for (const attempt of ['first', 'retry']) {
      const result = readResult(`${runId}-${attempt}-result.json`)
      assert.equal(result.historyId, `${runId}:same-history`)
      assert.equal(result.testCaseId, `${runId}:same-case`)
    }
  }
})

for (const failure of [{ error: new Error('spawn failed') }, { status: 1 }]) {
  test(`should surface report generation failure when the launcher returns ${Object.keys(failure)[0]}`, (t) => {
    const { root, writeRun } = setup(t)
    writeRun('run-1', { 'test-result.json': { labels: [{ name: 'parentSuite', value: 'chromium' }] } }, provenance)
    const spawn = t.mock.method(childProcess, 'spawnSync', () => failure)
    syncBuiltinESMExports()
    try {
      assert.throws(
        () => generateCombinedReport(root, ['run-1'], root, join(root, 'report')),
        /Combined Allure report generation failed/
      )
    } finally {
      spawn.mock.restore()
      syncBuiltinESMExports()
    }
  })
}

test('should generate exactly job then browser then tests for every matrix combination', (t) => {
  const { root, writeRun } = setup(t)
  const runIds = ['local-matrix-1', 'integration-0002']
  for (const runId of runIds) {
    const directory = writeRun(
      runId,
      Object.fromEntries(
        ['chromium', 'firefox', 'webkit'].flatMap((browser) =>
          ['one', 'two'].map((name) => [
            `${runId}-${browser}-${name}-result.json`,
            {
              uuid: `${runId}-${browser}-${name}`,
              name,
              status: 'passed',
              stage: 'finished',
              start: 1000,
              stop: 2000,
              historyId: `${browser}-${name}`,
              testCaseId: `${browser}-${name}`,
              labels: [
                { name: 'parentSuite', value: browser },
                { name: 'suite', value: 'initial.spec.ts' },
                { name: 'subSuite', value: 'Workspace' }
              ],
              parameters: [{ name: 'Project', value: browser }],
              attachments: [{ name: 'original attachment', source: `${runId}.txt`, type: 'text/plain' }]
            }
          ])
        )
      ),
      provenance
    )
    writeFileSync(join(directory, `${runId}.txt`), 'original attachment')
  }
  const report = join(root, 'report')
  assert.equal(generateCombinedReport(root, runIds, root, report), true)
  const suites = JSON.parse(readFileSync(join(report, 'data', 'suites.json'), 'utf8'))
  assert.deepEqual(suites.children.map(({ name }) => name).sort(), ['integration-job-0001', 'integration-job-0002'])
  for (const job of suites.children) {
    assert.deepEqual(job.children.map(({ name }) => name).sort(), ['chromium', 'firefox', 'webkit'])
    for (const browser of job.children) {
      assert.deepEqual(browser.children.map(({ name }) => name).sort(), ['one', 'two'])
      assert.ok(browser.children.every((testCase) => !testCase.children))
    }
  }
  const cases = readdirSync(join(report, 'data', 'test-cases'))
  assert.equal(cases.length, 12)
  for (const file of cases) {
    const result = JSON.parse(readFileSync(join(report, 'data', 'test-cases', file), 'utf8'))
    assert.equal(
      result.description,
      'Component versions:\n```json\n{\n  "ui.shell": "registry.example/shell:1"\n}\n```'
    )
    const attachment = result.testStage.attachments.find(({ name }) => name === 'versions.json')
    assert.deepEqual(
      JSON.parse(readFileSync(join(report, 'data', 'attachments', attachment.source), 'utf8')),
      provenance
    )
  }
})
