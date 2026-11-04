import { validateImage } from './matrix.mjs'

export const TEST_IMAGE = 'ghcr.io/doasdk/onecx-workspace-ui-e2e:0.0.3'

export function resolveTestImage(env = process.env) {
  return validateImage(env.E2E_IMAGE || TEST_IMAGE)
}

export function imageCommand(action, image) {
  validateImage(image)
  if (!['build', 'push'].includes(action)) throw new Error('Expected build or push action.')
  if (image.includes('@')) throw new Error('Build/push requires an image tag, not a digest reference.')
  return action === 'build'
    ? ['build', '--file', 'integration/Dockerfile', '--target', 'e2e', '-t', image, '.']
    : ['push', image]
}
