import { readFileSync } from 'node:fs'

function validateImage(image) {
  if (
    typeof image !== 'string' ||
    !/^[a-z0-9][a-z0-9._:/-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*|@sha256:[a-f0-9]{64})$/.test(image)
  ) {
    throw new Error('Images must be Docker references with an explicit tag or sha256 digest.')
  }
  return image
}

export function resolveTestImage(env = process.env) {
  const config = JSON.parse(readFileSync(new URL('../integration.config.json', import.meta.url), 'utf8'))
  return validateImage(env.E2E_IMAGE || config.test.image)
}

export function imageCommand(action, image, runtimeImage) {
  validateImage(image)
  if (!['build', 'push'].includes(action)) throw new Error('Expected build or push action.')
  if (image.includes('@')) throw new Error('Build/push requires an image tag, not a digest reference.')
  if (runtimeImage) validateImage(runtimeImage)
  return action === 'build'
    ? [
        'build',
        '--file',
        'integration/Dockerfile',
        '--target',
        'e2e',
        ...(runtimeImage ? ['--build-arg', `PLAYWRIGHT_RUNTIME_IMAGE=${runtimeImage}`] : []),
        '-t',
        image,
        '.'
      ]
    : ['push', image]
}
