import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import runtime from '../e2e/utils/data/runtimeConfig.cjs'

const directory = dirname(fileURLToPath(import.meta.url))
const shell = {
  baseUrl: 'https://old.test/shell/admin',
  loginUrl: 'https://identity.test/realms/onecx?redirect_uri=https%3A%2F%2Fold.test%2Fshell%2Fadmin',
  workspaceManagementUrl: 'https://old.test/shell/admin/workspace?view=list'
}
const env = (adminShell = shell) => ({ ENVIRONMENTS_JSON: JSON.stringify({ custom: { adminShell } }), ENV: 'custom' })

test('should preserve configured endpoints when no runtime override is provided', () => {
  assert.deepEqual(runtime.loadEnvironment(env()).adminShell, shell)
})

test('should rewrite shell, identity origin and redirect while preserving paths when platform metadata exists', () => {
  const actual = runtime.loadEnvironment({
    ...env(),
    PLATFORM_INFO_JSON: JSON.stringify({
      e2e: { baseUrl: 'https://new.test/runtime', keycloakUrl: 'https://new-identity.test/auth' }
    })
  }).adminShell
  assert.equal(actual.baseUrl, 'https://new.test/runtime')
  assert.equal(actual.workspaceManagementUrl, 'https://new.test/shell/admin/workspace?view=list')
  const login = new URL(actual.loginUrl)
  assert.equal(login.origin, 'https://new-identity.test')
  assert.equal(login.searchParams.get('redirect_uri'), 'https://new.test/shell/admin')
})

test('should prefer BASE_URL over platform base when both are supplied', () => {
  assert.equal(
    runtime.loadEnvironment({
      ...env(),
      BASE_URL: 'https://explicit.test/root',
      PLATFORM_INFO_JSON: JSON.stringify({
        e2e: { baseUrl: 'https://ignored.test', keycloakUrl: 'https://identity-new.test' }
      })
    }).adminShell.baseUrl,
    'https://explicit.test/root'
  )
})

test('should use runtime shell origin for same-origin login when identity metadata is absent', () => {
  const actual = runtime.loadEnvironment({
    ...env({ ...shell, loginUrl: '/welcome' }),
    BASE_URL: 'https://new.test'
  }).adminShell
  assert.equal(actual.loginUrl, 'https://new.test/welcome')
})

test('should use runtime origin for an external login when identity metadata is absent', () => {
  const actual = runtime.loadEnvironment({ ...env(), BASE_URL: 'https://new.test' }).adminShell
  assert.equal(new URL(actual.loginUrl).origin, 'https://new.test')
})

test('should select local environment when ENV is not set', () => {
  assert.equal(
    runtime.loadEnvironment({ ENVIRONMENTS_JSON: JSON.stringify({ local: { adminShell: shell } }) }).adminShell.baseUrl,
    shell.baseUrl
  )
})

test('should resolve absolute endpoints when runtime metadata replaces a missing configured base', () => {
  const actual = runtime.loadEnvironment({
    ...env({ ...shell, baseUrl: undefined }),
    BASE_URL: 'https://new.test'
  }).adminShell
  assert.equal(actual.workspaceManagementUrl, 'https://new.test/shell/admin/workspace?view=list')
})

test('should use the process environment when loaders receive no explicit environment', () => {
  const values = {
    ENV: 'custom',
    ENVIRONMENTS_JSON: env().ENVIRONMENTS_JSON,
    ENVIRONMENTS_JSON_FILE: '',
    TEST_DATA_JSON: '{"users":{"onecxUser":{"username":"synthetic-user","password":"synthetic-password"}}}',
    TEST_DATA_JSON_FILE: '',
    PLATFORM_INFO_JSON: '',
    BASE_URL: '',
    ONECX_TEST_CONFIG: '{"value":1}'
  }
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  try {
    assert.deepEqual(runtime.loadEnvironment().adminShell, shell)
    assert.equal(runtime.loadUsers().onecxUser.username, 'synthetic-user')
    assert.deepEqual(runtime.readRuntimeJson('ONECX_TEST_CONFIG_FILE', 'ONECX_TEST_CONFIG'), { value: 1 })
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

for (const [label, value] of [
  ['selected environment is absent', { ENVIRONMENTS_JSON: '{}', ENV: 'missing' }],
  ['shell is absent', { ENVIRONMENTS_JSON: '{"local":{}}' }],
  ['metadata is malformed', { ...env(), PLATFORM_INFO_JSON: '{secret' }],
  ['metadata lacks E2E endpoints', { ...env(), PLATFORM_INFO_JSON: '{}' }],
  ['workspace URL is absent', env({ ...shell, workspaceManagementUrl: '' })],
  ['workspace URL uses file protocol', env({ ...shell, workspaceManagementUrl: 'file:///secret' })],
  ['workspace URL embeds password', env({ ...shell, workspaceManagementUrl: 'https://user:secret@host.test' })],
  ['runtime base uses unsupported protocol', { ...env(), BASE_URL: 'file:///secret' }],
  ['runtime base is malformed', { ...env(), BASE_URL: 'secret' }],
  ['configured endpoint is malformed', env({ ...shell, workspaceManagementUrl: 'secret' })]
]) {
  test(`should reject environment when ${label}`, () => assert.throws(() => runtime.loadEnvironment(value)))
}

test('should load credentials from explicit JSON without preserving unrelated fields', () => {
  assert.deepEqual(
    runtime.loadUsers({
      TEST_DATA_JSON: JSON.stringify({
        users: { onecxUser: { username: 'user', password: 'secret', extra: 'private' } }
      })
    }),
    { onecxUser: { username: 'user', password: 'secret' } }
  )
})

for (const value of [
  '{}',
  'null',
  '{"users":{"onecxUser":{"username":"user","password":""}}}',
  '{"users":{"onecxUser":{"username":4,"password":"secret"}}}'
]) {
  test(`should reject invalid test credentials ${value}`, () =>
    assert.throws(() => runtime.loadUsers({ TEST_DATA_JSON: value })))
}

test('should load runtime JSON from file when explicit file variable is provided', async (t) => {
  const home = await mkdtemp(join(directory, '.test-config-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const path = join(home, 'input.json')
  await writeFile(path, '{"value":1}')
  assert.deepEqual(runtime.readRuntimeJson('FILE', 'JSON', undefined, { FILE: path }), { value: 1 })
})

test('should reject ambiguous file and JSON configuration', () => {
  assert.throws(() => runtime.readRuntimeJson('FILE', 'JSON', undefined, { FILE: 'file', JSON: '{}' }), /Specify only/)
})

test('should hide parser fragments when configuration JSON is malformed', () => {
  assert.throws(() => runtime.readRuntimeJson('FILE', 'JSON', undefined, { JSON: '{"secret' }), {
    message: 'Invalid JSON in runtime configuration (FILE/JSON).'
  })
})

test('should report safe error when runtime configuration file cannot be read', () => {
  assert.throws(() => runtime.readRuntimeJson('FILE', 'JSON', undefined, {}), {
    message: 'Cannot read runtime configuration. Provide FILE or JSON.'
  })
})
