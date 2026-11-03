import { resolve } from 'node:path'
import { isRecord, readRuntimeJson } from './runtimeConfig'

type ShellEnvironment = {
  baseUrl: string
  loginUrl: string
  workspaceManagementUrl: string
}

const environments = readRuntimeJson(
  'ENVIRONMENTS_JSON_FILE',
  'ENVIRONMENTS_JSON',
  resolve(__dirname, '../config/environments.json')
)
const selectedEnvironment = process.env.ENV || 'local'
if (!isRecord(environments) || !isRecord(environments[selectedEnvironment])) {
  throw new Error('Selected ENV is missing or invalid in environments configuration.')
}
const selected = environments[selectedEnvironment]
const shellConfig = selected.adminShell
if (!isRecord(shellConfig)) {
  throw new Error('Environment configuration must contain adminShell.')
}
const shell = shellConfig
let runtimeBase = process.env.BASE_URL
let runtimeKeycloak: string | undefined
if (process.env.PLATFORM_INFO_JSON) {
  let metadata: unknown
  try {
    metadata = JSON.parse(process.env.PLATFORM_INFO_JSON)
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

function endpoint(field: keyof ShellEnvironment): string {
  const value = shell[field]
  if (typeof value !== 'string' || !value) {
    throw new Error(`Environment configuration requires adminShell.${field}.`)
  }
  const base = runtimeBase
  try {
    const url = base ? new URL(value, base) : new URL(value)
    if (base) {
      // Preserve application paths/query strings but never the old environment's host.
      const originalBase = typeof shell.baseUrl === 'string' ? new URL(shell.baseUrl) : undefined
      const originalOrigin = originalBase ? new URL(value, originalBase).origin : undefined
      const target = new URL(
        field === 'loginUrl' && originalBase && originalOrigin !== originalBase.origin ? runtimeKeycloak || base : base
      )
      url.protocol = target.protocol
      url.host = target.host
      const redirect = url.searchParams.get('redirect_uri')
      if (redirect) {
        const redirectUrl = new URL(redirect)
        const shellUrl = new URL(base)
        redirectUrl.protocol = shellUrl.protocol
        redirectUrl.host = shellUrl.host
        url.searchParams.set('redirect_uri', redirectUrl.toString())
      }
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Unsupported URL')
    }
    return url.toString()
  } catch {
    throw new Error(`Invalid runtime URL for adminShell.${field}.`)
  }
}

export const environment = {
  ...selected,
  adminShell: {
    ...shell,
    baseUrl: runtimeBase ? new URL(runtimeBase).toString() : endpoint('baseUrl'),
    loginUrl: endpoint('loginUrl'),
    workspaceManagementUrl: endpoint('workspaceManagementUrl')
  }
}
