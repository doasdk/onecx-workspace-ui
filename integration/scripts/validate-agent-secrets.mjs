export function validateAgentSecrets(env, validators, report) {
  let valid = true
  for (const name of ['ENVIRONMENTS_JSON', 'TEST_DATA_JSON', 'AGENT_CONFIG_JSON']) {
    try {
      if (!env[name]) throw new Error('Missing configuration')
      if (name === 'AGENT_CONFIG_JSON') {
        validators.readAgentConfig({ AGENT_CONFIG_JSON: env[name] }, '/')
      } else {
        validators.runtimeJson(env[name], undefined, name, '/')
      }
      report(`${name}: valid`)
    } catch {
      valid = false
      report(`${name}: missing or invalid; check the integration environment secret and repository secret.`)
    }
  }
  return valid
}
