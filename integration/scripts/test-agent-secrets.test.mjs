import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAgentSecrets } from './validate-agent-secrets.mjs'

const names = ['ENVIRONMENTS_JSON', 'TEST_DATA_JSON', 'AGENT_CONFIG_JSON']
const env = Object.fromEntries(names.map((name) => [name, '{"private":"synthetic-secret"}']))

test('should use the shared validators when checking runtime secrets', () => {
  const calls = []
  const messages = []
  const validators = {
    runtimeJson: (...args) => calls.push(args),
    readAgentConfig: (...args) => calls.push(args)
  }
  assert.equal(
    validateAgentSecrets(env, validators, (message) => messages.push(message)),
    true
  )
  assert.deepEqual(calls, [
    [env.ENVIRONMENTS_JSON, undefined, 'ENVIRONMENTS_JSON', '/'],
    [env.TEST_DATA_JSON, undefined, 'TEST_DATA_JSON', '/'],
    [{ AGENT_CONFIG_JSON: env.AGENT_CONFIG_JSON }, '/']
  ])
  assert.deepEqual(
    messages,
    names.map((name) => `${name}: valid`)
  )
})

for (const name of names) {
  test(`should identify ${name} without disclosing contents when validation fails`, () => {
    const messages = []
    const validators = {
      runtimeJson: (value, file, label) => {
        if (label === name) throw new Error(value)
      },
      readAgentConfig: (value) => {
        if (name === 'AGENT_CONFIG_JSON') throw new Error(value.AGENT_CONFIG_JSON)
      }
    }
    assert.equal(
      validateAgentSecrets(env, validators, (message) => messages.push(message)),
      false
    )
    assert.equal(messages.length, 3)
    assert.ok(
      messages.includes(`${name}: missing or invalid; check the integration environment secret and repository secret.`)
    )
    assert.ok(messages.every((message) => !message.includes('synthetic-secret')))
  })

  test(`should identify ${name} when the secret is missing`, () => {
    const messages = []
    const validators = { runtimeJson() {}, readAgentConfig() {} }
    assert.equal(
      validateAgentSecrets({ ...env, [name]: '' }, validators, (message) => messages.push(message)),
      false
    )
    assert.ok(
      messages.includes(`${name}: missing or invalid; check the integration environment secret and repository secret.`)
    )
  })
}
