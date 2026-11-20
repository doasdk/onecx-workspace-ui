import assert from 'node:assert/strict'
import test from 'node:test'
import { imageCommand, resolveTestImage } from './image-management.mjs'

test('should preserve the default build command when a base image override is absent', () => {
  assert.deepEqual(imageCommand('build', 'app:local'), [
    'build',
    '--file',
    'integration/Dockerfile',
    '--target',
    'e2e',
    '-t',
    'app:local',
    '.'
  ])
})

test('should pass the published runtime reference when the build selects a base image', () => {
  assert.deepEqual(imageCommand('build', 'app:local', 'ghcr.io/owner/runtime:0.2.0'), [
    'build',
    '--file',
    'integration/Dockerfile',
    '--target',
    'e2e',
    '--build-arg',
    'PLAYWRIGHT_RUNTIME_IMAGE=ghcr.io/owner/runtime:0.2.0',
    '-t',
    'app:local',
    '.'
  ])
})

test('should preserve the push command when a runtime override is configured', () => {
  assert.deepEqual(imageCommand('push', 'app:release', 'runtime:release'), ['push', 'app:release'])
})

test('should reject invalid image overrides when building', () => {
  assert.throws(() => imageCommand('build', 'app:local', 'invalid runtime'), /Docker references/)
})

test('should reject an unversioned image when building', () => {
  assert.throws(() => imageCommand('build', 'app'), /explicit tag/)
})

test('should reject a missing image when building', () => {
  assert.throws(() => imageCommand('build', undefined), /Docker references/)
})

test('should reject unsupported operations when constructing image commands', () => {
  assert.throws(() => imageCommand('unknown', 'app:local'), /build or push/)
})

test('should reject digest-only target references when building or pushing', () => {
  assert.throws(() => imageCommand('build', `app@sha256:${'a'.repeat(64)}`), /tag/)
})

test('should honor the E2E image selection when resolving a test image', () => {
  assert.equal(resolveTestImage({ E2E_IMAGE: 'app:local' }), 'app:local')
})

test('should use the declarative test image when an override is absent', () => {
  assert.match(resolveTestImage({}), /^ghcr\.io\/doasdk\/onecx-workspace-ui-e2e:/)
})

test('should reject an invalid E2E image when resolving a test image', () => {
  assert.throws(() => resolveTestImage({ E2E_IMAGE: 'invalid image' }), /Docker references/)
})

test('should accept a digest when pushing an image is not requested', () => {
  const image = `registry.example/app@sha256:${'a'.repeat(64)}`
  assert.equal(resolveTestImage({ E2E_IMAGE: image }), image)
})

test('should select the agent Docker target when building an agent image', () => {
  assert.deepEqual(imageCommand('build', 'app-agent:local', undefined, 'agent'), [
    'build',
    '--file',
    'integration/Dockerfile',
    '--target',
    'agent',
    '-t',
    'app-agent:local',
    '.'
  ])
})

test('should preserve runtime overrides when building an agent image', () => {
  assert.ok(
    imageCommand('build', 'agent:local', 'runtime:local', 'agent').includes('PLAYWRIGHT_RUNTIME_IMAGE=runtime:local')
  )
})

test('should push the agent image when the agent target is selected', () => {
  assert.deepEqual(imageCommand('push', 'agent:release', undefined, 'agent'), ['push', 'agent:release'])
})

test('should use the separate agent image override when resolving an agent image', () => {
  assert.equal(resolveTestImage({ E2E_IMAGE: 'tests:local', AGENT_E2E_IMAGE: 'agent:local' }, 'agent'), 'agent:local')
})

test('should use the declarative agent image when only a deterministic override exists', () => {
  assert.match(
    resolveTestImage({ E2E_IMAGE: 'tests:local' }, 'agent'),
    /^ghcr\.io\/doasdk\/onecx-workspace-ui-e2e-agent:/
  )
})

test('should not use an agent image override when resolving deterministic tests', () => {
  assert.match(resolveTestImage({ AGENT_E2E_IMAGE: 'agent:local' }), /^ghcr\.io\/doasdk\/onecx-workspace-ui-e2e:/)
})

test('should reject an unknown target when resolving images', () => {
  assert.throws(() => resolveTestImage({}, 'unknown'), /target e2e or agent/)
})

test('should reject an unknown target when building images', () => {
  assert.throws(() => imageCommand('build', 'app:local', undefined, 'unknown'), /target e2e or agent/)
})

test('should pass the shared agent runtime override when building an agent image', () => {
  assert.ok(
    imageCommand('build', 'agent:local', undefined, 'agent', 'shared:agent').includes(
      'PLAYWRIGHT_AGENT_RUNTIME_IMAGE=shared:agent'
    )
  )
})

test('should not pass the shared agent runtime override when building deterministic images', () => {
  assert.equal(imageCommand('build', 'tests:local', undefined, 'e2e', 'shared:agent').includes('shared:agent'), false)
})

test('should reject an invalid shared agent runtime reference', () => {
  assert.throws(() => imageCommand('build', 'agent:local', undefined, 'agent', 'invalid image'), /Docker references/)
})
