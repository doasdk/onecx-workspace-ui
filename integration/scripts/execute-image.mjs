import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export async function executeImage({
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
  onContainer
}) {
  const docker = (args) =>
    execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120000
    }).trim()
  const name = `onecx-e2e-${randomUUID()}`
  const startedAt = new Date()
  const input = join(secretDir, 'runtime.json')
  writeFileSync(input, JSON.stringify({ metadata, environments, data, environment, script, capture }), { mode: 0o600 })
  const output = join(runDir, 'e2e-results', alias)
  mkdirSync(output, { recursive: true })
  let created = false
  try {
    docker([
      'create',
      '--name',
      name,
      '--network',
      metadata.network.id,
      '--network-alias',
      alias,
      '--entrypoint',
      'node',
      image,
      '/tmp/onecx-bootstrap.cjs'
    ])
    created = true
    onContainer(name)
    docker(['cp', input, `${name}:/tmp/onecx-runtime.json`])
    docker(['cp', fileURLToPath(new URL('./image-bootstrap.cjs', import.meta.url)), `${name}:/tmp/onecx-bootstrap.cjs`])
    docker(['cp', join(runDir, 'e2e', 'ca.pem'), `${name}:/tmp/onecx-ca.pem`])
    const log = openSync(join(secretDir, 'e2e.log'), 'w', 0o600)
    let timer
    let timedOut = false
    try {
      await new Promise((resolve, reject) => {
        const child = spawn('docker', ['start', '--attach', name], { stdio: ['ignore', log, log] })
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
    return [
      {
        networkAlias: alias,
        sequence: 1,
        total: 1,
        exitCode: state.ExitCode,
        status: timedOut ? 'timeout' : state.ExitCode === 0 ? 'success' : 'failed',
        success: !timedOut && state.ExitCode === 0,
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
