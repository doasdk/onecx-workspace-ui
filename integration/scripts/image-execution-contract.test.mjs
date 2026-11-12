import assert from 'node:assert/strict'
import test from 'node:test'
import {
  executionContract,
  executionFailureStage,
  executionStatus,
  runtimeContractLabel,
  runtimeEnvelope
} from './image-execution-contract.mjs'

test('should select the inherited launcher when the image advertises contract v1', () => {
  assert.equal(executionContract({ [runtimeContractLabel]: '1' }), '1')
})

test('should select compatibility mode when an older image has no contract label', () => {
  assert.equal(executionContract(), 'legacy')
  assert.equal(executionContract({ [runtimeContractLabel]: null }), 'legacy')
})

test('should reject the image when its contract version is unsupported', () => {
  assert.throws(() => executionContract({ [runtimeContractLabel]: '2' }), /Unsupported/)
})

test('should deliver opaque app configuration when preparing the generic runtime envelope', () => {
  const environments = {
    container: { adminShell: { loginUrl: 'https://old/login', workspaceManagementUrl: '/workspaces' } }
  }
  const data = { users: { onecxUser: { username: 'user', password: 'secret' } } }
  const metadata = { e2e: { baseUrl: 'https://shell', keycloakUrl: 'https://keycloak' }, network: { id: 'network' } }
  const envelope = runtimeEnvelope({
    metadata,
    environments,
    data,
    environment: 'container',
    script: 'tests:all',
    capture: false
  })
  assert.equal(envelope.version, 1)
  assert.equal(envelope.script, 'tests:all')
  assert.equal(envelope.config, 'playwright.config.ts')
  assert.deepEqual(JSON.parse(envelope.environment.ENVIRONMENTS_JSON), environments)
  assert.deepEqual(JSON.parse(envelope.environment.TEST_DATA_JSON), data)
  assert.deepEqual(JSON.parse(envelope.environment.PLATFORM_INFO_JSON), metadata)
  assert.equal(envelope.environment.BASE_URL, metadata.e2e.baseUrl)
  assert.equal(envelope.environment.OUTPUT_DIR, '/e2e-results')
  assert.equal(envelope.environment.CAPTURE_PRIVATE_ARTIFACTS, 'false')
})

test('should classify timeout when the container exceeds its deadline without a manifest', () => {
  assert.equal(executionStatus(137, true, undefined, '1'), 'timeout')
})

test('should retain legacy classification when an older image does not write a manifest', () => {
  assert.equal(executionStatus(0, false, undefined, 'legacy'), 'success')
  assert.equal(executionStatus(1, false, undefined, 'legacy'), 'failed')
})

for (const [status, exitCode] of [
  ['success', 0],
  ['test-failed', 1],
  ['configuration-failed', 2],
  ['interrupted', 143]
]) {
  test(`should preserve ${status} when the manifest matches the container status`, () => {
    assert.equal(executionStatus(exitCode, false, { version: 1, status, exitCode }, '1'), status)
  })
}

for (const manifest of [
  undefined,
  { version: 2 },
  { version: 1, status: 'unknown', exitCode: 1 },
  { version: 1, status: 'test-failed', exitCode: 2 },
  { version: 1, status: 'success', exitCode: 1 },
  { version: 1, status: 'test-failed', exitCode: 0 }
]) {
  test(`should reject invalid runtime output when manifest is ${JSON.stringify(manifest)}`, () => {
    assert.throws(
      () => executionStatus(manifest?.exitCode === 0 ? 0 : 1, false, manifest, '1'),
      /valid execution manifest/
    )
  })
}

test('should identify configuration failures separately from test assertion failures', () => {
  assert.equal(executionFailureStage([{ status: 'configuration-failed' }]), 'e2e-configuration')
  assert.equal(executionFailureStage([{ status: 'test-failed' }]), 'e2e')
  assert.equal(executionFailureStage([{ status: 'timeout' }]), 'e2e-timeout')
  assert.equal(executionFailureStage([{ status: 'interrupted' }]), 'interrupted')
})
