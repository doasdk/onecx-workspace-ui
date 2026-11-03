import { readFileSync } from 'node:fs'

export function readRuntimeJson(fileVariable: string, jsonVariable: string, fallbackPath: string): unknown {
  const file = process.env[fileVariable]
  const raw = process.env[jsonVariable]
  if (file && raw) {
    throw new Error(`Specify only ${fileVariable} or ${jsonVariable}, not both.`)
  }
  let content: string
  try {
    content = raw || readFileSync(file || fallbackPath, 'utf8')
  } catch {
    throw new Error(`Cannot read runtime configuration. Provide ${fileVariable} or ${jsonVariable}.`)
  }
  try {
    return JSON.parse(content)
  } catch {
    // JSON parser messages can contain fragments of secret input.
    throw new Error(`Invalid JSON in runtime configuration (${fileVariable}/${jsonVariable}).`)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
