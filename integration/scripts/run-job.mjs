import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const env = { ...process.env }
env.RUN_ID ||= `job-${env.GITHUB_RUN_ID || Date.now()}-${env.GITHUB_RUN_ATTEMPT || '1'}`
if (!/^[a-zA-Z0-9_-]+$/.test(env.RUN_ID)) throw new Error('Invalid RUN_ID.')
env.E2E_EXECUTION_MODE = 'docker-copy'
if (!env.TESTCONTAINERS_HOST_OVERRIDE && !existsSync('/.dockerenv')) {
  // Docker publishes ports on the machine running this script, so localhost is correct outside a container.
  env.TESTCONTAINERS_HOST_OVERRIDE = '127.0.0.1'
}
if (!env.TESTCONTAINERS_HOST_OVERRIDE) {
  const route = readFileSync('/proc/net/route', 'utf8')
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[1] === '00000000' && fields[2] !== '00000000')
  if (!route || !/^[A-Fa-f0-9]{8}$/.test(route[2])) {
    throw new Error('Cannot determine Docker host gateway. Set TESTCONTAINERS_HOST_OVERRIDE.')
  }
  env.TESTCONTAINERS_HOST_OVERRIDE = route[2]
    .match(/../g)
    .reverse()
    .map((byte) => parseInt(byte, 16))
    .join('.')
}
const directory = mkdtempSync(join(tmpdir(), 'onecx-job-'))
const logPath = join(directory, 'runner.log')
const fd = openSync(logPath, 'w', 0o600)
let child
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child?.kill(signal))
}
let status = 1
try {
  child = spawn(process.execPath, [fileURLToPath(new URL('./run-platform.mjs', import.meta.url))], {
    env,
    stdio: ['ignore', fd, fd]
  })
  status = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
} finally {
  closeSync(fd)
  if (env.CAPTURE_PRIVATE_ARTIFACTS === 'true') {
    const target = join('results', env.RUN_ID, 'private')
    mkdirSync(target, { recursive: true, mode: 0o700 })
    copyFileSync(logPath, join(target, 'runner.log'))
  }
  rmSync(directory, { recursive: true, force: true })
}
console.log(`Integration workload exited with status ${status}. See results/${env.RUN_ID}/summary.json.`)
process.exitCode = status
