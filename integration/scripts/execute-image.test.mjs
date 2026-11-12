import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { executeImage } from './execute-image.mjs'
import { runtimeContractLabel } from './image-execution-contract.mjs'

async function execute(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'onecx-execution-test-'))
  const secretDir = join(root, 'secrets')
  const runDir = join(root, 'run')
  mkdirSync(secretDir)
  mkdirSync(join(runDir, 'e2e'), { recursive: true })
  writeFileSync(join(runDir, 'e2e', 'ca.pem'), 'test-ca')
  const calls = []
  const observedContainers = []
  let child
  const docker = (args) => {
    calls.push(args)
    if (args[0] === 'image')
      return JSON.stringify(overrides.labels === undefined ? { [runtimeContractLabel]: '1' } : overrides.labels)
    if (args[0] === 'create' && overrides.createError) throw new Error('Cannot create container')
    if (args[0] === 'kill') {
      if (overrides.killError) throw new Error('Cannot kill container')
      setImmediate(() => child.emit('exit', 137))
    }
    if (args[0] === 'inspect')
      return JSON.stringify({ Status: overrides.state || 'exited', ExitCode: overrides.exitCode ?? 0 })
    if (args[0] === 'cp' && args[1].endsWith('/e2e-results/.')) {
      if (overrides.copyError) throw new Error('Cannot copy artifacts')
      if (!overrides.noManifest) {
        writeFileSync(
          join(args[2], 'execution.json'),
          JSON.stringify({
            version: 1,
            status: overrides.status || 'success',
            exitCode: overrides.exitCode ?? 0
          })
        )
      }
    }
    return ''
  }
  const spawn = () => {
    child = new EventEmitter()
    if (!overrides.timeout)
      setImmediate(() =>
        child.emit(overrides.spawnError ? 'error' : 'exit', overrides.spawnError ? new Error('Docker attach error') : 0)
      )
    return child
  }
  try {
    const records = await executeImage(
      {
        image: 'app:local',
        metadata: {
          network: { id: 'test-network' },
          e2e: { baseUrl: 'https://shell', keycloakUrl: 'https://keycloak' }
        },
        environments: { container: { adminShell: { loginUrl: 'https://old/login' } } },
        data: { users: { onecxUser: { username: 'user', password: 'test-password' } } },
        environment: 'container',
        script: 'tests:gui',
        capture: !!overrides.capture,
        secretDir,
        runDir,
        alias: 'tests',
        timeoutMs: overrides.timeout ? 10 : 1000,
        onContainer: (name) => observedContainers.push(name),
        ...(overrides.interrupted ? { isInterrupted: () => true } : {})
      },
      { docker, spawn }
    )
    return {
      records,
      calls,
      observedContainers,
      input: JSON.parse(readFileSync(join(secretDir, 'runtime.json'), 'utf8'))
    }
  } catch (error) {
    error.calls = calls
    error.observedContainers = observedContainers
    throw error
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('should retain the inherited entrypoint when the runtime supports the contract', async () => {
  const { calls, input, records, observedContainers } = await execute()
  const create = calls.find((args) => args[0] === 'create')
  assert.ok(create.includes('--init'))
  assert.ok(create.includes('ONECX_RUNTIME_FILE=/tmp/onecx-runtime.json'))
  assert.ok(!create.includes('--entrypoint'))
  assert.ok(!calls.some((args) => args.join(' ').includes('onecx-bootstrap.cjs')))
  assert.equal(input.version, 1)
  assert.equal(records[0].status, 'success')
  assert.equal(observedContainers.at(-1), undefined)
  assert.equal(calls.at(-1)[0], 'rm')
})

test('should retain older image compatibility when the contract is absent', async () => {
  const { calls, input, records } = await execute({ labels: null, noManifest: true, exitCode: 1 })
  assert.ok(calls.find((args) => args[0] === 'create').includes('--entrypoint'))
  assert.ok(calls.some((args) => args.join(' ').includes('onecx-bootstrap.cjs')))
  assert.equal(input.script, 'tests:gui')
  assert.equal(records[0].status, 'failed')
})

test('should export private logs only when explicitly requested', async () => {
  const { records } = await execute({ capture: true })
  assert.equal(records[0].success, true)
})

test('should classify assertion failures when the runtime reports failed tests', async () => {
  const { records } = await execute({ exitCode: 1, status: 'test-failed' })
  assert.equal(records[0].status, 'test-failed')
  assert.equal(records[0].success, false)
})

test('should terminate the container when the deadline expires', async () => {
  const { calls, records } = await execute({ timeout: true, noManifest: true, exitCode: 137 })
  assert.ok(calls.some((args) => args[0] === 'kill'))
  assert.equal(records[0].status, 'timeout')
})

test('should terminate a newly started container when cancellation arrived during creation', async () => {
  const { calls } = await execute({ interrupted: true })
  assert.ok(calls.some((args) => args[0] === 'kill' && args.includes('SIGTERM')))
})

for (const [options, expected] of [
  [{ labels: { [runtimeContractLabel]: '2' } }, /Unsupported/],
  [{ createError: true }, /Cannot create/],
  [{ spawnError: true }, /attach error/],
  [{ state: 'running' }, /did not exit/],
  [{ copyError: true }, /Cannot copy/],
  [{ noManifest: true }, /ENOENT/],
  [{ timeout: true, killError: true }, /Cannot kill/]
]) {
  test(`should fail explicitly and clean up when execution encounters ${JSON.stringify(options)}`, async () => {
    await assert.rejects(execute(options), (error) => {
      assert.match(error.message, expected)
      if (error.calls.some((args) => args[0] === 'cp')) {
        assert.equal(error.calls.at(-1)[0], 'rm')
      }
      return true
    })
  })
}
