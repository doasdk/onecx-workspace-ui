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

function validateTarget(target) {
  if (!['e2e', 'agent'].includes(target)) throw new Error('Expected image target e2e or agent.')
  return target
}

export function resolveTestImage(env = process.env, target = 'e2e') {
  validateTarget(target)
  const file = target === 'agent' ? '../integration.agent.config.json' : '../integration.config.json'
  const config = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
  return validateImage((target === 'agent' ? env.AGENT_E2E_IMAGE : env.E2E_IMAGE) || config.test.image)
}

export function imageCommand(action, image, runtimeImage, target = 'e2e', agentRuntimeImage) {
  validateTarget(target)
  validateImage(image)
  if (!['build', 'push'].includes(action)) throw new Error('Expected build or push action.')
  if (image.includes('@')) throw new Error('Build/push requires an image tag, not a digest reference.')
  if (runtimeImage) validateImage(runtimeImage)
  if (agentRuntimeImage) validateImage(agentRuntimeImage)
  return action === 'build'
    ? [
        'build',
        '--file',
        'integration/Dockerfile',
        '--target',
        target,
        ...(runtimeImage ? ['--build-arg', `PLAYWRIGHT_RUNTIME_IMAGE=${runtimeImage}`] : []),
        ...(target === 'agent' && agentRuntimeImage
          ? ['--build-arg', `PLAYWRIGHT_AGENT_RUNTIME_IMAGE=${agentRuntimeImage}`]
          : []),
        '-t',
        image,
        '.'
      ]
    : ['push', image]
}
