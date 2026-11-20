const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRuntimeJson(fileVariable, jsonVariable, fallbackPath, env = process.env) {
  const file = env[fileVariable]
  const raw = env[jsonVariable]
  if (file && raw) throw new Error(`Specify only ${fileVariable} or ${jsonVariable}, not both.`)
  let content
  try {
    content = raw || readFileSync(file || fallbackPath, 'utf8')
  } catch {
    throw new Error(`Cannot read runtime configuration. Provide ${fileVariable} or ${jsonVariable}.`)
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`Invalid JSON in runtime configuration (${fileVariable}/${jsonVariable}).`)
  }
}

function loadEnvironment(env = process.env) {
  const environments = readRuntimeJson(
    'ENVIRONMENTS_JSON_FILE',
    'ENVIRONMENTS_JSON',
    resolve(__dirname, '../config/environments.json'),
    env
  )
  const selectedEnvironment = env.ENV || 'local'
  if (!isRecord(environments) || !isRecord(environments[selectedEnvironment])) {
    throw new Error('Selected ENV is missing or invalid in environments configuration.')
  }
  const selected = environments[selectedEnvironment]
  const shell = selected.adminShell
  if (!isRecord(shell)) throw new Error('Environment configuration must contain adminShell.')
  let runtimeBase = env.BASE_URL
  let runtimeKeycloak
  if (env.PLATFORM_INFO_JSON) {
    let metadata
    try {
      metadata = JSON.parse(env.PLATFORM_INFO_JSON)
    } catch {
      throw new Error('Invalid platform metadata JSON.')
    }
    if (
      !isRecord(metadata) ||
      !isRecord(metadata.e2e) ||
      typeof metadata.e2e.baseUrl !== 'string' ||
      typeof metadata.e2e.keycloakUrl !== 'string'
    ) {
      throw new Error('Platform metadata must contain E2E baseUrl and keycloakUrl.')
    }
    runtimeBase ||= metadata.e2e.baseUrl
    runtimeKeycloak = metadata.e2e.keycloakUrl
  }
  function endpoint(field) {
    const value = shell[field]
    if (typeof value !== 'string' || !value) {
      throw new Error(`Environment configuration requires adminShell.${field}.`)
    }
    try {
      const url = runtimeBase ? new URL(value, runtimeBase) : new URL(value)
      if (runtimeBase) {
        const originalBase = typeof shell.baseUrl === 'string' ? new URL(shell.baseUrl) : undefined
        const originalOrigin = originalBase ? new URL(value, originalBase).origin : undefined
        const target = new URL(
          field === 'loginUrl' && originalBase && originalOrigin !== originalBase.origin
            ? runtimeKeycloak || runtimeBase
            : runtimeBase
        )
        url.protocol = target.protocol
        url.host = target.host
        const redirect = url.searchParams.get('redirect_uri')
        if (redirect) {
          const redirectUrl = new URL(redirect)
          const shellUrl = new URL(runtimeBase)
          redirectUrl.protocol = shellUrl.protocol
          redirectUrl.host = shellUrl.host
          url.searchParams.set('redirect_uri', redirectUrl.toString())
        }
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
      return url.toString()
    } catch {
      throw new Error(`Invalid runtime URL for adminShell.${field}.`)
    }
  }
  return {
    ...selected,
    adminShell: {
      ...shell,
      baseUrl: runtimeBase ? validatedBase(runtimeBase) : endpoint('baseUrl'),
      loginUrl: endpoint('loginUrl'),
      workspaceManagementUrl: endpoint('workspaceManagementUrl')
    }
  }
}

function validatedBase(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
    return url.toString()
  } catch {
    throw new Error('Invalid runtime URL for adminShell.baseUrl.')
  }
}

function loadUsers(env = process.env) {
  const data = readRuntimeJson('TEST_DATA_JSON_FILE', 'TEST_DATA_JSON', resolve(__dirname, '../config/data.json'), env)
  if (
    !isRecord(data) ||
    !isRecord(data.users) ||
    !isRecord(data.users.onecxUser) ||
    typeof data.users.onecxUser.username !== 'string' ||
    !data.users.onecxUser.username ||
    typeof data.users.onecxUser.password !== 'string' ||
    !data.users.onecxUser.password
  ) {
    throw new Error('Test data requires users.onecxUser with non-empty username and password.')
  }
  return { onecxUser: { username: data.users.onecxUser.username, password: data.users.onecxUser.password } }
}

module.exports = { isRecord, readRuntimeJson, loadEnvironment, loadUsers }
