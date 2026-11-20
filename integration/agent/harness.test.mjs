import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const bridge = require('./harness.cjs')

test('should forward live-page requests when a source runtime directory is configured', async () => {
  const runtime = await mkdtemp(join(tmpdir(), 'onecx-consumer-bridge-'))
  const previous = process.env.ONECX_AGENT_RUNTIME_DIR
  try {
    await writeFile(
      join(runtime, 'playwright.cjs'),
      'exports.createLiveBrowser = (options) => options; exports.runBrowserAgent = (options) => options; exports.initializeAgentReport = (options) => options; exports.recordAssessment = (...args) => args; exports.createAgentFixtures = (options) => options'
    )
    process.env.ONECX_AGENT_RUNTIME_DIR = runtime
    const options = { prepared: true }
    assert.equal(bridge.createLiveBrowser(options), options)
    assert.equal(bridge.runBrowserAgent(options), options)
    assert.equal(bridge.initializeAgentReport(options), options)
    assert.deepEqual(bridge.recordAssessment(options, 2, 3), [options, 2, 3])
    assert.equal(bridge.createAgentFixtures(options), options)
    assert.equal(bridge.reporterPath(), join(runtime, 'allure-reporter.cjs'))
  } finally {
    if (previous === undefined) delete process.env.ONECX_AGENT_RUNTIME_DIR
    else process.env.ONECX_AGENT_RUNTIME_DIR = previous
    await rm(runtime, { recursive: true, force: true })
  }
})

test('should resolve the inherited runtime directory when no source override is configured', () => {
  const original = process.env.ONECX_AGENT_RUNTIME_DIR
  const load = require('node:module')._load
  const options = { prepared: true }
  delete process.env.ONECX_AGENT_RUNTIME_DIR
  require('node:module')._load = (id, ...args) => {
    if (id === join('/opt/onecx-agent', 'playwright.cjs')) {
      return { createLiveBrowser: (value) => value, runBrowserAgent: (value) => value }
    }
    return load(id, ...args)
  }
  try {
    assert.equal(bridge.createLiveBrowser(options), options)
    assert.equal(bridge.reporterPath(), join('/opt/onecx-agent', 'allure-reporter.cjs'))
  } finally {
    require('node:module')._load = load
    if (original !== undefined) process.env.ONECX_AGENT_RUNTIME_DIR = original
  }
})
