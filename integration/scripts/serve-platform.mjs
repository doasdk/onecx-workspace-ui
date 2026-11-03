import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tls from 'node:tls'
import { setTimeout as delay } from 'node:timers/promises'
import { applySelection, components, parseJson, validateImage, validateSelection } from './matrix.mjs'
import { resolveTestImage } from './test-image-management.mjs'

if (process.platform !== 'linux') {
  throw new Error('Run it:serve inside WSL/Linux, where the Docker daemon is available.')
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const selectionFile = process.argv[2]
if (!selectionFile || process.argv.length !== 3) {
  throw new Error('Usage: npm run it:serve -- <selection.json> (one image string per component).')
}
const selection = validateSelection(parseJson(readFileSync(resolve(selectionFile), 'utf8'), 'Version selection'))
const docker = (args, timeout = 600000) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout
  }).trim()
const temporary = mkdtempSync(join(tmpdir(), 'onecx-local-'))
const runDir = resolve(root, 'integration-tests', 'artifacts', `local-${randomUUID()}`)
const gateway = `onecx-browser-${randomUUID()}`
let manager
let gatewayCreated = false
let importerId
let interrupted = false
let stop
const stopped = new Promise((resolveStop) => {
  stop = resolveStop
})
const onSignal = () => {
  interrupted = true
  stop()
}
process.on('SIGINT', onSignal)
process.on('SIGTERM', onSignal)
const assertActive = () => {
  if (interrupted) throw new Error('Local platform startup interrupted.')
}

try {
  docker(['info'])
  // Apply the same package compatibility fixes as CI, before importing the manager.
  await import('./patch-keycloak-startup.mjs')
  await import('./patch-service-health.mjs')
  await import('./patch-ui-cors.mjs')
  const template = parseJson(readFileSync(join(root, 'integration', 'platform.json'), 'utf8'), 'Platform template')
  const config = applySelection(template, selection, resolveTestImage())
  delete config.platformConfig.container.e2e
  const expectedImages = {}
  for (const key of Object.keys(components)) {
    assertActive()
    const [group, name] = key.split('.')
    const definition = config.platformConfig.platformOverrides[group][name]
    validateImage(definition.image)
    docker(['pull', definition.image])
    const image = parseJson(docker(['image', 'inspect', definition.image]), 'Image inspection')[0]
    if (!image.RepoDigests?.[0]) throw new Error(`No registry digest for ${key}.`)
    expectedImages[key] = image.Id
    definition.image = image.RepoDigests[0]
  }
  mkdirSync(runDir, { recursive: true, mode: 0o700 })
  process.env.RUN_ID = runDir.split(/[\\/]/).pop()
  process.env.E2E_BASE_DIR = runDir
  const configFile = join(temporary, 'platform.json')
  writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 })
  const { PlatformManager } = await import('@onecx/integration-tests')
  manager = new PlatformManager(configFile)
  if (!manager.hasValidatedConfig()) throw new Error('Local platform configuration validation failed.')
  await manager.startContainers()
  assertActive()
  const metadata = await manager.getPlatformInfo()
  if (!metadata?.network?.id) throw new Error('Platform network metadata missing.')
  for (const [key, alias] of Object.entries(components)) {
    if (key === 'core.importmanager') continue
    const container = manager.getAllContainers().get(alias)
    if (!container || docker(['inspect', '--format', '{{.Image}}', container.getId()]) !== expectedImages[key]) {
      throw new Error(`Missing container or substituted image for ${key}.`)
    }
  }
  if (config.platformConfig.importData) {
    const ids = docker(['ps', '-aq', '--filter', `network=${metadata.network.id}`])
      .split(/\s+/)
      .filter(Boolean)
    if (!ids.length) throw new Error('Platform containers missing.')
    const inspections = parseJson(docker(['inspect', ...ids]), 'Container inspection')
    const importer = inspections.find((item) =>
      Object.values(item.NetworkSettings.Networks).some((network) => network.Aliases?.includes('importManager'))
    )
    if (!importer) throw new Error('Data import container missing.')
    importerId = importer.Id
    if (importer.Image !== expectedImages['core.importmanager'] || docker(['wait', importerId], 120000) !== '0') {
      throw new Error('Data import failed or used a substituted image.')
    }
  }
  await manager.exportPlatformInfo()
  await manager.checkAllHealthy()
  assertActive()
  const hosts = Object.values(metadata.containers)
    .filter((container) => container.internalUrl?.startsWith('https://'))
    .map((container) => new URL(container.internalUrl))
  if (!hosts.length) throw new Error('No HTTPS platform endpoints exported.')
  for (const url of hosts) {
    if (!/^[a-z0-9-]+$/.test(url.hostname) || url.port !== '8443') {
      throw new Error('Unsupported HTTPS alias or port in platform metadata.')
    }
  }
  // TLS passthrough preserves the package-issued certificates and Keycloak issuer.
  const nginx = [
    'events {}',
    'stream {',
    '  map $ssl_preread_server_name $upstream {',
    '    default 127.0.0.1:1;',
    ...hosts.map((url) => `    ${url.hostname} ${url.hostname}:8443;`),
    '  }',
    '  server {',
    '    listen 8443;',
    '    resolver 127.0.0.11 valid=10s;',
    '    ssl_preread on;',
    '    proxy_connect_timeout 5s;',
    '    proxy_pass $upstream;',
    '  }',
    '}'
  ].join('\n')
  const gatewayConfig = join(temporary, 'nginx.conf')
  writeFileSync(gatewayConfig, nginx)
  docker([
    'create',
    '--name',
    gateway,
    '--network',
    metadata.network.id,
    '--publish',
    '127.0.0.1:8443:8443',
    'nginx:1.28-alpine'
  ])
  gatewayCreated = true
  docker(['cp', gatewayConfig, `${gateway}:/etc/nginx/nginx.conf`])
  docker(['start', gateway])
  const ca = readFileSync(join(runDir, 'e2e', 'ca.pem'))
  for (const url of hosts) {
    const deadline = Date.now() + 30000
    while (true) {
      assertActive()
      try {
        await new Promise((accept, reject) => {
          const socket = tls.connect({ host: '127.0.0.1', port: 8443, servername: url.hostname, ca })
          socket.setTimeout(5000, () => socket.destroy(new Error(`Gateway TLS timeout for ${url.hostname}.`)))
          socket.once('secureConnect', () => {
            socket.destroy()
            accept()
          })
          socket.once('error', reject)
        })
        break
      } catch (error) {
        if (Date.now() >= deadline) throw error
        await delay(500)
      }
    }
  }
  console.log('\nPlatform ready. Add this line to the Windows hosts file as Administrator:')
  console.log(`127.0.0.1 ${hosts.map((url) => url.hostname).join(' ')}`)
  console.log(`Open ${new URL('/onecx-shell/admin/workspace', metadata.e2e.baseUrl).href}`)
  console.log(`Run CA certificate: ${join(runDir, 'e2e', 'ca.pem')}`)
  console.log('Keep this terminal open. Ctrl+C stops this platform and its browser gateway.')
  await stopped
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  for (const id of [gatewayCreated ? gateway : undefined, importerId].filter(Boolean)) {
    try {
      docker(['rm', '-f', id])
    } catch (error) {
      console.error('Local container cleanup failed.', error)
      process.exitCode = 1
    }
  }
  if (manager) {
    try {
      await manager.stopAllContainers()
    } catch (error) {
      console.error('Platform cleanup failed.', error)
      process.exitCode = 1
    }
  }
  rmSync(temporary, { recursive: true, force: true })
  process.off('SIGINT', onSignal)
  process.off('SIGTERM', onSignal)
}
