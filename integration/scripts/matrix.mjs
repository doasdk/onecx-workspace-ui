import { readFileSync } from 'node:fs'

export const components = {
  'core.postgres': 'postgresdb',
  'core.keycloak': 'keycloak-app',
  'core.importmanager': 'importManager',
  'services.iamKc': 'onecx-iam-kc-svc',
  'services.parameter': 'onecx-parameter-svc',
  'services.workspace': 'onecx-workspace-svc',
  'services.userProfile': 'onecx-user-profile-svc',
  'services.theme': 'onecx-theme-svc',
  'services.tenant': 'onecx-tenant-svc',
  'services.productStore': 'onecx-product-store-svc',
  'services.permission': 'onecx-permission-svc',
  'bff.parameter': 'onecx-parameter-bff',
  'bff.shell': 'onecx-shell-bff',
  'bff.workspace': 'onecx-workspace-bff',
  'ui.shell': 'onecx-shell-ui',
  'ui.workspace': 'onecx-workspace-ui'
}

export function parseJson(content, label) {
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`${label} must contain valid JSON.`)
  }
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function validateImage(image) {
  // Require an explicit tag/digest and reject credentials, whitespace, and shell syntax.
  if (
    typeof image !== 'string' ||
    !/^[a-z0-9][a-z0-9._:/-]*(?::[A-Za-z0-9_][A-Za-z0-9_.-]*|@sha256:[a-f0-9]{64})$/.test(image)
  ) {
    throw new Error('Images must be Docker references with an explicit tag or sha256 digest.')
  }
  return image
}

export function validateSelection(selection) {
  if (!isRecord(selection)) throw new Error('Version selection must be an object.')
  for (const [key, image] of Object.entries(selection)) {
    if (!Object.hasOwn(components, key)) throw new Error(`Unsupported matrix component: ${key}`)
    validateImage(image)
  }
  return selection
}

export function expandMatrix(matrix) {
  if (!isRecord(matrix) || Object.keys(matrix).length === 0) {
    throw new Error('Version matrix must be a non-empty object.')
  }
  let combinations = [{}]
  for (const [key, images] of Object.entries(matrix)) {
    if (!Object.hasOwn(components, key)) throw new Error(`Unsupported matrix component: ${key}`)
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error(`Matrix component ${key} requires at least one image.`)
    }
    images.forEach(validateImage)
    if (new Set(images).size !== images.length) throw new Error(`Duplicate images for ${key}.`)
    combinations = combinations.flatMap((selection) => images.map((image) => ({ ...selection, [key]: image })))
  }
  return combinations
}

export function loadMatrix(env = process.env) {
  return parseJson(
    env.VERSION_MATRIX_JSON || readFileSync(new URL('../versions.json', import.meta.url), 'utf8'),
    'Version matrix'
  )
}

export function applySelection(template, selection, e2eImage) {
  validateSelection(selection)
  const config = structuredClone(template)
  for (const [key, image] of Object.entries(selection)) {
    const [group, name] = key.split('.')
    config.platformConfig.platformOverrides[group][name] = { image }
  }
  config.platformConfig.container.e2e[0].image = validateImage(e2eImage)
  return config
}

export function decodeSelection(encoded = '') {
  if (!encoded) return {}
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('Invalid encoded version selection.')
  return validateSelection(parseJson(Buffer.from(encoded, 'base64').toString('utf8'), 'Version selection'))
}

export function safeSummary(summary) {
  const records = (summary.e2eExecutions || []).map((record) => ({
    networkAlias: record.networkAlias,
    sequence: record.sequence,
    total: record.total,
    status: record.status,
    success: record.success,
    exitCode: record.exitCode,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    durationMs: record.durationMs ?? record.duration
  }))
  const succeeded = records.filter((record) => record.success).length
  return {
    runId: summary.runId,
    status: summary.status,
    exitCode: summary.exitCode,
    startTime: summary.startTime,
    endTime: summary.endTime,
    durationMs: summary.durationMs,
    failureStage: summary.failureStage,
    interruptedBy: summary.interruptedBy,
    mode: 'e2e',
    e2eExecutions: records,
    e2eAggregate: {
      total: records.length,
      succeeded,
      failed: records.length - succeeded,
      finalStatus: summary.status === 'success' ? 'success' : 'failure'
    }
  }
}
