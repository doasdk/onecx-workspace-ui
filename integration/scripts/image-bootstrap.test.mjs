import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./image-bootstrap.cjs', import.meta.url), 'utf8')

function bootstrap(files) {
  let command
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
      writeFileSync: () => {}
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
  return command
}

test('should run the automation package when the image contains the independent manifest', () => {
  const command = bootstrap(['/app/integration/e2e/playwright.config.ts', '/app/integration/package.json'])
  assert.equal(command.options.cwd, '/app/integration')
})

test('should prefer the automation package when the image also contains a root manifest', () => {
  const command = bootstrap([
    '/app/integration/e2e/playwright.config.ts',
    '/app/integration/package.json',
    '/app/package.json'
  ])
  assert.equal(command.options.cwd, '/app/integration')
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
  assert.throws(
    () => bootstrap(['/app/integration/e2e/playwright.config.ts']),
    /Expected an automation package manifest/
  )
})
