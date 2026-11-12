import { validateImage } from './matrix.mjs'

export const TEST_IMAGE = 'ghcr.io/doasdk/onecx-workspace-ui-e2e:0.0.7'

export function resolveTestImage(env = process.env) {
  return validateImage(env.E2E_IMAGE || TEST_IMAGE)
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
