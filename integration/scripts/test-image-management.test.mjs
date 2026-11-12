import assert from 'node:assert/strict'
import test from 'node:test'
import { imageCommand, resolveTestImage } from './test-image-management.mjs'

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

test('should reject unsupported operations when constructing image commands', () => {
  assert.throws(() => imageCommand('unknown', 'app:local'), /build or push/)
})

test('should reject digest-only target references when building or pushing', () => {
  assert.throws(() => imageCommand('build', `app@sha256:${'a'.repeat(64)}`), /tag/)
})

test('should honor the E2E image selection when resolving a test image', () => {
  assert.equal(resolveTestImage({ E2E_IMAGE: 'app:local' }), 'app:local')
  assert.match(resolveTestImage({}), /^ghcr\.io\//)
})
