import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { executionContract, executionStatus, runtimeEnvelope } from './image-execution-contract.mjs'

export async function executeImage(
  {
    image,
    metadata,
    environments,
    data,
    environment,
    script,
    capture,
    secretDir,
    runDir,
    alias,
    timeoutMs,
    onContainer,
    isInterrupted = () => false
  },
  dependencies = {}
) {
  const docker =
    dependencies.docker ||
    ((args) =>
      execFileSync('docker', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120000
      }).trim())
  const start = dependencies.spawn || spawn
  const name = `onecx-e2e-${randomUUID()}`
  const startedAt = new Date()
  const input = join(secretDir, 'runtime.json')
  const labels = JSON.parse(docker(['image', 'inspect', '--format', '{{json .Config.Labels}}', image]))
  const contract = executionContract(labels || {})
  const options = { metadata, environments, data, environment, script, capture }
  writeFileSync(input, JSON.stringify(contract === '1' ? runtimeEnvelope(options) : options), { mode: 0o600 })
  const output = join(runDir, 'e2e-results', alias)
  mkdirSync(output, { recursive: true })
  let created = false
  try {
    if (contract === 'legacy') {
      console.warn('Legacy E2E image: using compatibility bootstrap. Rebuild with OneCX runtime contract v1.')
    }
    docker([
      'create',
      '--init',
      '--name',
      name,
      '--network',
      metadata.network.id,
      '--network-alias',
      alias,
      ...(contract === '1' ? ['--env', 'ONECX_RUNTIME_FILE=/tmp/onecx-runtime.json'] : ['--entrypoint', 'node']),
      image,
      ...(contract === '1' ? [script] : ['/tmp/onecx-bootstrap.cjs'])
    ])
    created = true
    onContainer(name)
    docker(['cp', input, `${name}:/tmp/onecx-runtime.json`])
    if (contract === 'legacy') {
      docker([
        'cp',
        fileURLToPath(new URL('./image-bootstrap.cjs', import.meta.url)),
        `${name}:/tmp/onecx-bootstrap.cjs`
      ])
    }
    docker(['cp', join(runDir, 'e2e', 'ca.pem'), `${name}:/tmp/onecx-ca.pem`])
    const log = openSync(join(secretDir, 'e2e.log'), 'w', 0o600)
    let timer
    let timedOut = false
    try {
      await new Promise((resolve, reject) => {
        const child = start('docker', ['start', '--attach', name], { stdio: ['ignore', log, log] })
        // A signal received while the container was being created must not start a long test run.
        if (isInterrupted()) docker(['kill', '--signal', 'SIGTERM', name])
        timer = setTimeout(() => {
          timedOut = true
          try {
            docker(['kill', name])
          } catch (error) {
            reject(error)
          }
        }, timeoutMs)
        child.once('error', reject)
        child.once('exit', resolve)
      })
    } finally {
      clearTimeout(timer)
      closeSync(log)
    }
    const state = JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]))
    if (state.Status !== 'exited') throw new Error('E2E container did not exit.')
    docker(['cp', `${name}:/e2e-results/.`, output])
    const manifestPath = join(output, 'execution.json')
    const manifest = contract === '1' && !timedOut ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined
    const status = executionStatus(state.ExitCode, timedOut, manifest, contract)
    return [
      {
        networkAlias: alias,
        sequence: 1,
        total: 1,
        exitCode: state.ExitCode,
        status,
        success: status === 'success',
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime()
      }
    ]
  } finally {
    if (capture && existsSync(join(secretDir, 'e2e.log'))) {
      copyFileSync(join(secretDir, 'e2e.log'), join(output, 'container.log'))
    }
    onContainer(undefined)
    if (created) docker(['rm', '-f', name])
  }
}
