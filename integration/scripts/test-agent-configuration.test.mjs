import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const json = (file) => JSON.parse(read(file))

test('should retain the handwritten test script when adding the agent lane', () => {
  assert.equal(json('integration.config.json').test.script, 'tests:gui')
})

test('should isolate platforms using identical version selections when both lanes execute', () => {
  const deterministic = json('integration.config.json')
  const source = json('integration.agent.config.json')
  assert.equal(source.extends, './integration.config.json')
  assert.deepEqual(Object.keys(source).sort(), ['extends', 'schemaVersion', 'test'])
  const agent = { ...json(source.extends), ...source }
  assert.deepEqual(agent.platform, deterministic.platform)
  assert.deepEqual(agent.components, deterministic.components)
  assert.equal(agent.matrix, deterministic.matrix)
  assert.equal(agent.environment, deterministic.environment)
  assert.notEqual(agent.test.image, deterministic.test.image)
  assert.equal(agent.test.script, 'tests:agent')
  assert.equal(agent.test.timeoutMs, 1800000)
  assert.equal(agent.artifacts.capturePrivate, false)
})

test('should execute the fixed fixture-based wrapper when selecting the agent lane', () => {
  assert.equal(json('package.json').scripts['tests:agent'], 'playwright test --config=agent/playwright.config.ts')
})

test('should include every required check in the consumer prompt', () => {
  const config = json('agent.config.json')
  const prompt = read(config.prompt)
  assert.equal(config.schemaVersion, 1)
  assert.equal(new Set(config.requiredChecks).size, config.requiredChecks.length)
  for (const id of config.requiredChecks) assert.ok(prompt.includes(`\`${id}\``))
  assert.deepEqual(config.requiredTools, ['browser_snapshot', 'browser_click'])
  assert.equal(Object.hasOwn(config, 'authentication'), false)
  assert.ok(read('agent/fixtures.ts').includes("from '../e2e/fixtures/basePage'"))
})

test('should inherit agent tooling from the shared image while preserving the default deterministic target', () => {
  const dockerfile = read('Dockerfile')
  assert.match(dockerfile, /FROM \$\{PLAYWRIGHT_AGENT_RUNTIME_IMAGE\} AS agent/)
  assert.match(dockerfile, /COPY integration\/agent\.config\.json/)
  assert.match(dockerfile, /COPY integration\/agent\.playwright\.config\.ts \.\/playwright\.config\.ts/)
  assert.match(dockerfile.trim(), /FROM test-runtime AS e2e$/)
  assert.doesNotMatch(dockerfile, /npm.+@playwright\/mcp/)
})

test('should select the shared sanitized Allure reporter when configuring the agent lane', () => {
  assert.ok(read('Dockerfile.dockerignore').includes('!integration/agent/harness.cjs'))
  assert.ok(read('agent/playwright.config.ts').includes('reporterPath()'))
  assert.ok(read('agent/harness.cjs').includes('allure-reporter.cjs'))
})

test('should omit app-owned reporter and media helpers when reusing the shared agent runtime', () => {
  for (const helper of ['allure-reporter.cjs', 'media.cjs']) {
    assert.equal(existsSync(new URL(`../agent/${helper}`, import.meta.url)), false)
    assert.ok(!read('Dockerfile.dockerignore').includes(`!integration/agent/${helper}`))
  }
})
