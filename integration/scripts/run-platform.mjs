import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { applySelection, components, decodeSelection, isRecord, parseJson, safeSummary } from './matrix.mjs'
import { resolveTestImage } from './test-image-management.mjs'
import { executionFailureStage } from './image-execution-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const integrationRoot = join(root, 'integration')
const runId = process.env.RUN_ID || `run-${Date.now()}`
if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('RUN_ID must contain only letters, numbers, _ and -.')
const runDir = resolve('integration-tests', 'artifacts', runId)
const publicDir = resolve('results', runId)
const privateArtifacts = process.env.CAPTURE_PRIVATE_ARTIFACTS === 'true'
let manager
let interruptedBy
let secretDir
let importerId
let e2eContainer
let allureResultsDir
let executionManifest
let stage = 'configuration'
const started = new Date()
const lock = parseJson(readFileSync(join(integrationRoot, 'package-lock.json'), 'utf8'), 'Dependency lockfile')
const provenance = { runId, runnerVersion: lock.packages['node_modules/@onecx/integration-tests'].version, images: {} }
const summary = { runId, startTime: started.toISOString(), status: 'failure', exitCode: 1, e2eExecutions: [] }

function docker(args, timeout = 600000) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout
  }).trim()
}

function runtimeJson(fileVariable, jsonVariable, fallback) {
  if (process.env[fileVariable] && process.env[jsonVariable]) {
    throw new Error(`Specify only ${fileVariable} or ${jsonVariable}.`)
  }
  let content
  try {
    content = process.env[jsonVariable] || readFileSync(process.env[fileVariable] || fallback, 'utf8')
  } catch {
    throw new Error(`Cannot read ${fileVariable}.`)
  }
  return JSON.stringify(parseJson(content, jsonVariable))
}

function resolveImage(image) {
  // Local images are supported for workstation runs; CI uses published immutable images.
  const inspect = () => parseJson(docker(['image', 'inspect', image]), 'Docker image inspection')[0]
  if (!image.endsWith(':local') || process.env.CI) docker(['pull', image])
  const info = inspect()
  const pinned = image.includes('@sha256:') ? image : info.RepoDigests?.[0]
  if (!pinned && process.env.CI) throw new Error('CI images must have a registry digest.')
  return { requested: image, resolved: pinned || image, imageId: info.Id }
}

function assertNotInterrupted() {
  if (interruptedBy) throw new Error('Run interrupted.')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interruptedBy = signal
    if (e2eContainer) {
      try {
        docker(['kill', '--signal', signal, e2eContainer])
      } catch (error) {
        console.error('Cannot interrupt E2E container.', error)
      }
    }
  })
}

mkdirSync(publicDir, { recursive: true })
mkdirSync(runDir, { recursive: true, mode: 0o700 })
process.env.RUN_ID = runId
process.env.ARTIFACTS_ROOT = resolve('integration-tests')
process.env.E2E_BASE_DIR = runDir

try {
  const template = parseJson(readFileSync(join(root, 'integration', 'platform.json'), 'utf8'), 'Platform template')
  const config = applySelection(template, decodeSelection(process.env.MATRIX_SELECTION_BASE64), resolveTestImage())
  const e2e = config.platformConfig.container.e2e[0]
  allureResultsDir = join(runDir, 'e2e-results', e2e.networkAlias, 'allure-results')
  executionManifest = join(runDir, 'e2e-results', e2e.networkAlias, 'execution.json')
  const environments = runtimeJson(
    'ENVIRONMENTS_JSON_FILE',
    'ENVIRONMENTS_JSON',
    join(root, 'integration', 'e2e', 'utils', 'config', 'environments.json')
  )
  const testData = runtimeJson(
    'TEST_DATA_JSON_FILE',
    'TEST_DATA_JSON',
    join(root, 'integration', 'e2e', 'utils', 'config', 'data.json')
  )
  const selectedEnvironment = process.env.ENV || 'local'
  const parsedEnvironments = parseJson(environments, 'Environments configuration')
  const parsedData = parseJson(testData, 'Test data')
  if (
    !isRecord(parsedEnvironments) ||
    !isRecord(parsedEnvironments[selectedEnvironment]) ||
    !isRecord(parsedData) ||
    !isRecord(parsedData.users) ||
    !isRecord(parsedData.users.onecxUser)
  ) {
    throw new Error('Runtime configuration is missing the selected environment or test user.')
  }
  const shell = parsedEnvironments[selectedEnvironment].adminShell
  const user = parsedData.users.onecxUser
  if (
    !isRecord(shell) ||
    ['baseUrl', 'loginUrl', 'workspaceManagementUrl'].some((key) => typeof shell[key] !== 'string' || !shell[key]) ||
    ['username', 'password'].some((key) => typeof user[key] !== 'string' || !user[key])
  ) {
    throw new Error('Runtime configuration requires application URLs and non-empty test-user credentials.')
  }
  e2e.environments = {
    ENVIRONMENTS_JSON: environments,
    TEST_DATA_JSON: testData,
    ENV: selectedEnvironment,
    TEST_SCRIPT: process.env.TEST_SCRIPT || 'tests:gui',
    OUTPUT_DIR: '/e2e-results',
    CI: 'true',
    CAPTURE_PRIVATE_ARTIFACTS: String(privateArtifacts)
  }
  secretDir = mkdtempSync(join(tmpdir(), 'onecx-it-'))
  const configPath = join(secretDir, 'platform.json')
  const writeConfig = () => writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 })
  writeConfig()
  const { PlatformManager } = await import('@onecx/integration-tests')
  manager = new PlatformManager(configPath)
  if (!manager.hasValidatedConfig()) throw new Error('Platform schema validation failed.')
  if (process.argv.includes('--dry-run')) {
    summary.status = 'success'
    summary.exitCode = 0
  } else {
    stage = 'image-resolution'
    docker(['info'])
    for (const [key] of Object.entries(components)) {
      assertNotInterrupted()
      const [group, name] = key.split('.')
      const definition = config.platformConfig.platformOverrides[group][name]
      const image = resolveImage(definition.image)
      provenance.images[key] = image
      definition.image = image.resolved
    }
    provenance.images.e2e = resolveImage(e2e.image)
    e2e.image = provenance.images.e2e.resolved
    writeConfig()
    manager = new PlatformManager(
      configPath,
      privateArtifacts
        ? (name) => {
            const logDir = join(runDir, 'logs')
            mkdirSync(logDir, { recursive: true })
            return join(logDir, `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.log`)
          }
        : undefined
    )
    if (!manager.hasValidatedConfig()) throw new Error('Resolved platform schema validation failed.')
    stage = 'platform-startup'
    await manager.startContainers()
    assertNotInterrupted()
    stage = 'image-verification'
    const metadata = await manager.getPlatformInfo()
    if (!metadata?.e2e?.baseUrl) throw new Error('Runner did not export the platform base URL.')
    // 0.11.1 can fall back to default images. Reject any such substitution before testing.
    for (const [key, alias] of Object.entries(components)) {
      if (key === 'core.importmanager') continue
      const container = manager.getAllContainers().get(alias)
      if (!container) throw new Error(`Missing expected platform container: ${alias}`)
      const actualImage = docker(['inspect', '--format', '{{.Image}}', container.getId()])
      if (actualImage !== provenance.images[key].imageId) {
        throw new Error(`Runner substituted an unexpected image for ${key}.`)
      }
      provenance.images[key].verified = true
    }
    if (config.platformConfig.importData) {
      const ids = docker(['ps', '-aq', '--filter', `network=${metadata.network.id}`])
        .split(/\s+/)
        .filter(Boolean)
      const inspections = parseJson(docker(['inspect', ...ids]), 'Platform container inspection')
      const importer = inspections.find((item) =>
        Object.values(item.NetworkSettings.Networks).some((network) => network.Aliases?.includes('importManager'))
      )
      if (!importer) throw new Error('Data import container is missing.')
      importerId = importer.Id
      if (importer.Image !== provenance.images['core.importmanager'].imageId) {
        throw new Error('Runner substituted an unexpected import manager image.')
      }
      if (docker(['wait', importerId], 120000) !== '0') throw new Error('Platform data import failed.')
      provenance.images['core.importmanager'].verified = true
    }
    stage = 'health-check'
    await manager.exportPlatformInfo()
    const runtimeE2e = manager.getValidatedConfig().container.e2e[0]
    runtimeE2e.baseUrl = metadata.e2e.baseUrl
    runtimeE2e.environments.PLATFORM_INFO_JSON = JSON.stringify(metadata)
    await manager.checkAllHealthy()
    assertNotInterrupted()
    stage = 'e2e'
    const records = await (
      await import('./execute-image.mjs')
    ).executeImage({
      image: e2e.image,
      metadata,
      environments: parsedEnvironments,
      data: parsedData,
      environment: selectedEnvironment,
      script: process.env.TEST_SCRIPT || 'tests:gui',
      capture: privateArtifacts,
      secretDir,
      runDir,
      alias: e2e.networkAlias,
      timeoutMs: e2e.timeoutMs || 1800000,
      isInterrupted: () => !!interruptedBy,
      onContainer: (name) => {
        e2eContainer = name
      }
    })
    summary.e2eExecutions = records || []
    if (records.some((record) => !record.success)) summary.failureStage = executionFailureStage(records)
    if (
      records?.length === config.platformConfig.container.e2e.length &&
      records.every((record) => record.success) &&
      !interruptedBy
    ) {
      summary.status = 'success'
      summary.exitCode = 0
    }
  }
} catch (error) {
  summary.status = 'failure'
  summary.exitCode = 1
  summary.failureStage = stage
  console.error(`Integration run failed during ${stage}.`, error)
} finally {
  if (importerId) {
    try {
      docker(['rm', '-f', importerId])
    } catch (error) {
      summary.status = 'failure'
      summary.exitCode = 1
      summary.failureStage = 'cleanup'
      console.error('Import container cleanup failed.', error)
    }
  }
  if (manager) {
    try {
      await manager.stopAllContainers()
    } catch (error) {
      summary.status = 'failure'
      summary.exitCode = 1
      summary.failureStage = 'cleanup'
      console.error('Platform cleanup failed.', error)
    }
  }
  if (allureResultsDir && existsSync(allureResultsDir)) {
    cpSync(allureResultsDir, join(publicDir, 'allure-results'), { recursive: true })
    const generated = spawnSync(
      join(integrationRoot, 'node_modules', '.bin', 'allure'),
      ['generate', allureResultsDir, '--clean', '-o', join(publicDir, 'allure-report')],
      { stdio: 'inherit' }
    )
    if (generated.error || generated.status !== 0) {
      summary.status = 'failure'
      summary.exitCode = 1
      summary.failureStage = 'report'
      console.error('Allure report generation failed.', generated.error || `Exit code: ${generated.status}`)
    }
  }
  if (executionManifest && existsSync(executionManifest)) {
    cpSync(executionManifest, join(publicDir, 'execution.json'))
  }
  if (secretDir) rmSync(secretDir, { recursive: true, force: true })
  summary.endTime = new Date().toISOString()
  summary.durationMs = Date.now() - started.getTime()
  summary.interruptedBy = interruptedBy
  if (interruptedBy) {
    summary.status = 'failure'
    summary.exitCode = 1
    summary.failureStage = 'interrupted'
  }
  if (summary.status !== 'success' && !summary.failureStage) summary.failureStage = stage
  const safe = safeSummary(summary)
  writeFileSync(join(publicDir, 'summary.json'), JSON.stringify(safe, null, 2))
  writeFileSync(join(publicDir, 'versions.json'), JSON.stringify(provenance, null, 2))
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(safe, null, 2))
  const e2eDir = join(runDir, 'e2e')
  mkdirSync(e2eDir, { recursive: true })
  writeFileSync(
    join(e2eDir, 'e2e-executions.json'),
    JSON.stringify({ records: safe.e2eExecutions, aggregate: safe.e2eAggregate }, null, 2)
  )
  if (privateArtifacts) {
    const privateDir = join(publicDir, 'private')
    mkdirSync(privateDir, { recursive: true, mode: 0o700 })
    const { cpSync } = await import('node:fs')
    cpSync(runDir, privateDir, { recursive: true })
  }
}
console.log(`Integration run ${summary.status}.`)
process.exit(summary.exitCode)
