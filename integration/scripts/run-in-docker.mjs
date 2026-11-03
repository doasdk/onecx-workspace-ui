import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync
} from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { parseJson, validateImage } from './matrix.mjs'
import { resolveTestImage } from './test-image-management.mjs'

const env = process.env
const runId = env.RUN_ID || `job-${env.GITHUB_RUN_ID || randomUUID()}-${env.GITHUB_RUN_ATTEMPT || '1'}`
if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('Invalid RUN_ID.')
const orchestratorImage = validateImage(env.ORCHESTRATOR_IMAGE)
const e2eImage = resolveTestImage(env)
const environmentsFile = resolve(env.ENVIRONMENTS_JSON_FILE || env.ENVIRONMENTS_JSON || '')
const dataFile = resolve(env.TEST_DATA_JSON_FILE || env.TEST_DATA_JSON || '')
for (const file of [environmentsFile, dataFile]) {
  if (!existsSync(file) || !readFileSync(file, 'utf8'))
    throw new Error('Missing configuration file. Set ENVIRONMENTS_JSON_FILE and TEST_DATA_JSON_FILE.')
}
const resultRoot = resolve(env.GITHUB_WORKSPACE || '.', 'results')
if (existsSync(join(resultRoot, runId))) throw new Error('Results already exist for RUN_ID; select a new RUN_ID.')
mkdirSync(resultRoot, { recursive: true })
const logDir = mkdtempSync(join(tmpdir(), 'onecx-docker-'))
const logPath = join(logDir, 'orchestrator.log')
const logFd = openSync(logPath, 'a', 0o600)
const suffix = randomUUID()
const volume = `onecx-it-${suffix}`
const container = `onecx-orchestrator-${suffix}`
let volumeCreated = false
let containerCreated = false
let workRoot
let exitCode = 1
let signal

function docker(args) {
  try {
    return execFileSync('docker', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', logFd],
      timeout: 600000
    }).trim()
  } catch (error) {
    appendFileSync(logPath, `${error}\n`)
    throw new Error(`Docker ${args[0]} failed. Check runner access and private registry permissions.`)
  }
}

for (const name of ['SIGINT', 'SIGTERM']) {
  process.on(name, () => {
    signal = name
    if (containerCreated) {
      try {
        docker(['kill', '--signal', name, container])
      } catch (error) {
        console.error(error.message)
      }
    }
  })
}

try {
  docker(['info'])
  docker(['volume', 'create', volume])
  volumeCreated = true
  workRoot = docker(['volume', 'inspect', '--format', '{{.Mountpoint}}', volume])
  docker([
    'create',
    '--name',
    container,
    // Matching daemon/container paths make the runner's E2E bind mounts work under DinD.
    '--mount',
    `type=volume,source=${volume},target=${workRoot}`,
    '--mount',
    'type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--workdir',
    workRoot,
    '--env',
    'TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal',
    '--env',
    `RUN_ID=${runId}`,
    '--env',
    `CI=${env.CI || ''}`,
    '--env',
    `E2E_IMAGE=${e2eImage}`,
    '--env',
    `MATRIX_SELECTION_BASE64=${env.MATRIX_SELECTION_BASE64 || ''}`,
    '--env',
    `ENV=${env.ENV || 'local'}`,
    '--env',
    `TEST_SCRIPT=${env.TEST_SCRIPT || 'tests:gui'}`,
    '--env',
    `CAPTURE_PRIVATE_ARTIFACTS=${env.CAPTURE_PRIVATE_ARTIFACTS || 'false'}`,
    '--env',
    'ENVIRONMENTS_JSON_FILE=/run/secrets/environments.json',
    '--env',
    'TEST_DATA_JSON_FILE=/run/secrets/data.json',
    orchestratorImage
  ])
  containerCreated = true
  docker(['cp', environmentsFile, `${container}:/run/secrets/environments.json`])
  docker(['cp', dataFile, `${container}:/run/secrets/data.json`])
  const authFile = env.DOCKER_CONFIG_FILE || join(env.DOCKER_CONFIG || join(homedir(), '.docker'), 'config.json')
  if (existsSync(authFile)) {
    const auth = parseJson(readFileSync(authFile, 'utf8'), 'Docker authentication config')
    if (auth.credsStore || Object.keys(auth.credHelpers || {}).length) {
      throw new Error(
        'Use DOCKER_CONFIG_FILE with inline registry auth; host credential helpers cannot run in the orchestrator.'
      )
    }
    docker(['cp', authFile, `${container}:/root/.docker/config.json`])
  }
  if (signal) throw new Error('Run interrupted before startup.')
  const attachStatus = await new Promise((resolveStatus, reject) => {
    const child = spawn('docker', ['start', '--attach', container], { stdio: ['ignore', logFd, logFd] })
    child.once('error', reject)
    child.once('exit', resolveStatus)
  })
  const state = parseJson(docker(['inspect', '--format', '{{json .State}}', container]), 'Orchestrator state')
  if (state.Status !== 'exited') throw new Error('Orchestrator did not finish normally.')
  exitCode = state.ExitCode || (attachStatus ? 1 : 0)
} catch (error) {
  appendFileSync(logPath, `${error}\n`)
  console.error(error.message)
  exitCode = 1
} finally {
  if (containerCreated) {
    try {
      docker(['cp', `${container}:${workRoot}/results/.`, resultRoot])
    } catch (error) {
      console.error('Result export failed.', error.message)
      exitCode = 1
    }
    try {
      docker(['rm', '-f', container])
    } catch (error) {
      console.error('Orchestrator cleanup failed.', error.message)
      exitCode = 1
    }
  }
  if (volumeCreated) {
    try {
      docker(['volume', 'rm', volume])
    } catch (error) {
      console.error('Result volume cleanup failed.', error.message)
      exitCode = 1
    }
  }
  closeSync(logFd)
  if (env.CAPTURE_PRIVATE_ARTIFACTS === 'true') {
    const privateDir = join(resultRoot, runId, 'private')
    mkdirSync(privateDir, { recursive: true, mode: 0o700 })
    copyFileSync(logPath, join(privateDir, 'orchestrator.log'))
  }
  rmSync(logDir, { recursive: true, force: true })
}
if (signal) exitCode = signal === 'SIGINT' ? 130 : 143
console.log(`Integration workload exited with status ${exitCode}.`)
process.exitCode = exitCode
