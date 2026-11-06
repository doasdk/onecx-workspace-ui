import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./image-bootstrap.cjs', import.meta.url), 'utf8')

function bootstrap(files) {
  let command
  const writtenFiles = []
  const input = {
    metadata: {
      e2e: { baseUrl: 'https://shell:8443', keycloakUrl: 'https://keycloak:8443' }
    },
    environments: {
      container: {
        adminShell: {
          baseUrl: 'https://localhost',
          loginUrl: 'https://localhost/login',
          workspaceManagementUrl: 'https://localhost/workspaces'
        }
      }
    },
    data: {},
    environment: 'container',
    script: 'tests:gui',
    capture: false
  }
  const modules = {
    'node:fs': {
      readFileSync: () => JSON.stringify(input),
      existsSync: (file) => files.includes(file),
      mkdirSync: () => {},
      writeFileSync: (file, content) => writtenFiles.push({ file, content })
    },
    'node:path': path.posix,
    'node:child_process': {
      spawnSync: (executable, args, options) => {
        command = { executable, args, options }
        return { status: 0 }
      }
    }
  }
  runInNewContext(source, {
    require: (name) => modules[name],
    URL,
    process: { env: {}, exit: () => {} }
  })
  command.writtenFiles = writtenFiles
  return command
}

test('should run the automation package when the image contains the independent manifest', () => {
  const command = bootstrap(['/app/integration/playwright.config.ts', '/app/integration/package.json'])
  assert.equal(command.options.cwd, '/app/integration')
})

test('should write runtime configuration beside E2E utilities when the config is at integration root', () => {
  const command = bootstrap(['/app/integration/playwright.config.ts', '/app/integration/package.json'])
  assert.ok(command.writtenFiles.some(({ file }) => file === '/app/integration/e2e/utils/config/environments.json'))
  assert.ok(command.writtenFiles.some(({ file }) => file === '/app/integration/e2e/utils/config/data.json'))
  const wrapper = command.writtenFiles.find(({ file }) => file === '/app/integration/onecx-runtime.config.ts')
  assert.match(wrapper.content, /video: 'on'/)
})

test('should prefer the automation package when the image also contains a root manifest', () => {
  const command = bootstrap([
    '/app/integration/playwright.config.ts',
    '/app/integration/package.json',
    '/app/package.json'
  ])
  assert.equal(command.options.cwd, '/app/integration')
})

function loadRuntimeConfig() {
  const command = bootstrap(['/app/integration/playwright.config.ts', '/app/integration/package.json'])
  const wrapper = command.writtenFiles.find(({ file }) => file === '/app/integration/onecx-runtime.config.ts')
  const module = { exports: {} }
  runInNewContext(wrapper.content.replace('export default', 'module.exports ='), {
    module,
    require: (name) => {
      if (name === 'node:path') return path.posix
      assert.equal(name, '/app/integration/playwright.config.ts')
      return { default: { testDir: './e2e/tests', tsconfig: './tsconfig.json' } }
    }
  })
  return { wrapper, config: module.exports }
}

test('should preserve the E2E test directory when the runtime wrapper loads the integration root config', () => {
  const { config } = loadRuntimeConfig()
  assert.equal(config.testDir, '/app/integration/e2e/tests')
})

test('should preserve the TypeScript config location when the runtime wrapper loads the integration root config', () => {
  const { wrapper, config } = loadRuntimeConfig()
  assert.equal(path.posix.resolve(path.posix.dirname(wrapper.file), config.tsconfig), '/app/integration/tsconfig.json')
})

test('should support the root package when the image uses the previous nested test layout', () => {
  const command = bootstrap(['/app/integration/e2e/playwright.config.ts', '/app/package.json'])
  assert.equal(command.options.cwd, '/app')
})

test('should support the root package when the image uses the flat test layout', () => {
  const command = bootstrap(['/app/playwright.config.ts', '/app/package.json'])
  assert.equal(command.options.cwd, '/app')
})

test('should reject the image when no automation package manifest exists', () => {
  assert.throws(() => bootstrap(['/app/integration/playwright.config.ts']), /Expected an automation package manifest/)
})
