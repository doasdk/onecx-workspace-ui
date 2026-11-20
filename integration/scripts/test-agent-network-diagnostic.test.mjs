import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { rootCertificates } from 'node:tls'
import { fileURLToPath } from 'node:url'
import { diagnose, httpsCheck, tcpCheck, withTimeout } from './agent-network-diagnostic.mjs'
import { runDiagnostic } from './run-agent-network-diagnostic.mjs'

const config = {
  anthropicBaseUrl: 'https://gateway.invalid/api',
  model: 'synthetic-model',
  authToken: 'synthetic-secret'
}

function operations(overrides = {}) {
  return {
    lookup: async () => ({ address: '127.0.0.1' }),
    tcpCheck: async () => {},
    httpsCheck: async (url, settings, authenticated) => (authenticated ? 200 : 405),
    withTimeout: (promise) => promise,
    ...overrides
  }
}

test('should retain the base path when sending the minimal model request', async () => {
  const calls = []
  const messages = []
  assert.equal(
    await diagnose(
      config,
      (message) => messages.push(message),
      operations({
        httpsCheck: async (url, settings, authenticated) => {
          calls.push([url.href, authenticated])
          return authenticated ? 200 : 401
        }
      })
    ),
    true
  )
  assert.deepEqual(calls, [
    ['https://gateway.invalid/api', false],
    ['https://gateway.invalid/api/v1/messages', true]
  ])
  assert.deepEqual(messages, ['DNS: passed', 'TCP: passed', 'HTTPS: passed (HTTP 401)', 'MODEL: passed (HTTP 200)'])
})

test('should use the configured port when the gateway has a nonstandard port', async () => {
  let actual
  await diagnose(
    { ...config, anthropicBaseUrl: 'https://gateway.invalid:8443/' },
    () => {},
    operations({
      tcpCheck: async (...args) => {
        actual = args
      }
    })
  )
  assert.deepEqual(actual, ['gateway.invalid', 8443])
})

for (const stage of ['DNS', 'TCP', 'HTTPS', 'MODEL']) {
  test(`should stop with a safe code when ${stage} fails`, async () => {
    const messages = []
    const fail = async () => {
      throw Object.assign(new Error(config.authToken), { code: 'ETIMEDOUT' })
    }
    const checks = operations({
      ...(stage === 'DNS' ? { lookup: fail } : {}),
      ...(stage === 'TCP' ? { tcpCheck: fail } : {}),
      httpsCheck: async (url, settings, authenticated) => {
        if (stage === (authenticated ? 'MODEL' : 'HTTPS')) return fail()
        return 200
      }
    })
    assert.equal(await diagnose(config, (message) => messages.push(message), checks), false)
    assert.equal(messages.at(-1), `${stage}: failed (ETIMEDOUT)`)
    assert.ok(!messages.join().includes(config.authToken))
  })
}

test('should omit unknown error details when a network library throws', async () => {
  const messages = []
  await diagnose(
    config,
    (message) => messages.push(message),
    operations({
      lookup: async () => {
        throw { code: config.authToken }
      }
    })
  )
  assert.deepEqual(messages, ['DNS: failed (UNCLASSIFIED_ERROR)'])
})

test('should handle missing error objects when an operation rejects', async () => {
  const messages = []
  await diagnose(config, (message) => messages.push(message), operations({ lookup: () => Promise.reject() }))
  assert.deepEqual(messages, ['DNS: failed (UNCLASSIFIED_ERROR)'])
})

for (const status of [403, undefined]) {
  test(`should reject a model response when its HTTP status is ${status}`, async () => {
    const messages = []
    assert.equal(
      await diagnose(
        config,
        (message) => messages.push(message),
        operations({
          httpsCheck: async (url, settings, authenticated) => (authenticated ? status : 200)
        })
      ),
      false
    )
    assert.equal(messages.at(-1), `MODEL: failed (HTTP ${status ?? 'unknown'})`)
  })
}

test('should resolve the operation when it completes before the deadline', async () => {
  assert.equal(await withTimeout(Promise.resolve('done')), 'done')
})

test('should reject with a safe timeout code when the deadline expires', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 1), { code: 'ETIMEDOUT' })
})

function socketMock(event) {
  const socket = new EventEmitter()
  socket.setTimeout = (value) => assert.equal(value, 10000)
  socket.destroy = (error) => {
    if (error) socket.emit('error', error)
  }
  queueMicrotask(() => socket.emit(event, Object.assign(new Error(), { code: 'ECONNREFUSED' })))
  return socket
}

test('should close the TCP socket when connection succeeds', async () => {
  await tcpCheck('gateway.invalid', 443, (options) => {
    assert.deepEqual(options, { host: 'gateway.invalid', port: 443 })
    return socketMock('connect')
  })
})

test('should reject TCP errors when the connection is refused', async () => {
  await assert.rejects(
    tcpCheck('gateway.invalid', 443, () => socketMock('error')),
    { code: 'ECONNREFUSED' }
  )
})

test('should destroy the TCP socket when its timeout expires', async () => {
  await assert.rejects(
    tcpCheck('gateway.invalid', 443, () => socketMock('timeout')),
    { code: 'ETIMEDOUT' }
  )
})

function requestMock(inspect, event = 'response') {
  return (url, options, response) => {
    const req = new EventEmitter()
    let timeout
    req.setTimeout = (value, handler) => {
      assert.equal(value, 20000)
      timeout = handler
    }
    req.destroy = (error) => req.emit('error', error)
    req.end = (body) => {
      inspect(url, options, body)
      queueMicrotask(() => {
        if (event === 'timeout') timeout()
        else if (event === 'error') req.emit('error', { code: 'ECONNRESET' })
        else response({ statusCode: 200, destroy() {} })
      })
    }
    return req
  }
}

test('should omit authentication when probing HTTPS connectivity', async () => {
  assert.equal(
    await httpsCheck(
      new URL(config.anthropicBaseUrl),
      config,
      false,
      requestMock((url, options, body) => {
        assert.deepEqual(options, { method: 'HEAD', headers: {} })
        assert.equal(body, undefined)
      })
    ),
    200
  )
})

test('should add corporate roots and bearer authentication when probing the model', async () => {
  await httpsCheck(
    new URL(config.anthropicBaseUrl),
    { ...config, extraCaCertPem: 'synthetic-ca' },
    true,
    requestMock((url, options, body) => {
      assert.deepEqual(options.ca, [...rootCertificates, 'synthetic-ca'])
      assert.equal(options.headers.authorization, `Bearer ${config.authToken}`)
      assert.equal(options.method, 'POST')
      assert.equal(options.headers['anthropic-version'], '2023-06-01')
      assert.deepEqual(JSON.parse(body), {
        model: config.model,
        max_tokens: 8,
        messages: [{ role: 'user', content: 'Reply OK.' }]
      })
    })
  )
})

test('should use the API key header when bearer authentication is not configured', async () => {
  await httpsCheck(
    new URL(config.anthropicBaseUrl),
    { model: config.model, apiKey: 'synthetic-key' },
    true,
    requestMock((url, options) => {
      assert.equal(options.headers['x-api-key'], 'synthetic-key')
      assert.equal(options.headers.authorization, undefined)
    })
  )
})

test('should reject HTTPS timeouts when the request stalls', async () => {
  await assert.rejects(
    httpsCheck(
      new URL(config.anthropicBaseUrl),
      config,
      false,
      requestMock(() => {}, 'timeout')
    ),
    { code: 'ETIMEDOUT' }
  )
})

test('should reject HTTPS errors when the connection resets', async () => {
  await assert.rejects(
    httpsCheck(
      new URL(config.anthropicBaseUrl),
      config,
      false,
      requestMock(() => {}, 'error')
    ),
    { code: 'ECONNRESET' }
  )
})

test('should isolate diagnostics from the platform workflow when manually dispatched', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/agent-diagnostics.yml', import.meta.url), 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.match(workflow, /environment: integration/)
  assert.match(workflow, /--env AGENT_CONFIG_JSON/)
  assert.match(workflow, /--network bridge/)
  assert.match(workflow, /--entrypoint node/)
  assert.match(workflow, /timeout-minutes: 5/)
  assert.doesNotMatch(workflow, /platform\.json|launch\.sh|tests:agent/)
})

test('should remove the secret from the environment before running network checks', async () => {
  const env = { AGENT_CONFIG_JSON: 'private-config' }
  const result = await runDiagnostic(
    env,
    async () => ({
      parseAgentConfig: (input) => {
        assert.equal(input.AGENT_CONFIG_JSON, 'private-config')
        return config
      }
    }),
    () => {},
    async (actual) => {
      assert.equal(env.AGENT_CONFIG_JSON, undefined)
      assert.equal(actual, config)
      return true
    }
  )
  assert.equal(result, true)
})

test('should report only a fixed message when model configuration validation throws', async () => {
  const messages = []
  const env = { AGENT_CONFIG_JSON: config.authToken }
  assert.equal(
    await runDiagnostic(
      env,
      async () => ({
        parseAgentConfig: () => {
          throw new Error(config.authToken)
        }
      }),
      (message) => messages.push(message)
    ),
    false
  )
  assert.deepEqual(messages, ['CONFIGURATION: failed (missing, invalid, or incompatible runtime validator)'])
  assert.equal(env.AGENT_CONFIG_JSON, undefined)
})

test('should fail safely when the selected image does not provide the runtime validator', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./run-agent-network-diagnostic.mjs', import.meta.url))],
    { encoding: 'utf8', env: { ...process.env, AGENT_CONFIG_JSON: 'synthetic-secret' } }
  )
  assert.equal(result.status, 1)
  assert.equal(result.stderr, '')
  assert.equal(result.stdout.trim(), 'CONFIGURATION: failed (missing, invalid, or incompatible runtime validator)')
})
