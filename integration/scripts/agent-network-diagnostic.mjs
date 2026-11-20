import { lookup } from 'node:dns/promises'
import { connect } from 'node:net'
import { request } from 'node:https'
import { rootCertificates } from 'node:tls'

const codes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID'
])

export function withTimeout(operation, milliseconds = 10000) {
  let timer
  return Promise.race([
    operation,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(), { code: 'ETIMEDOUT' })), milliseconds)
    })
  ]).finally(() => clearTimeout(timer))
}

export function tcpCheck(host, port, open = connect) {
  return new Promise((resolve, reject) => {
    const socket = open({ host, port })
    socket.setTimeout(10000)
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('timeout', () => socket.destroy(Object.assign(new Error(), { code: 'ETIMEDOUT' })))
    socket.once('error', reject)
  })
}

export function httpsCheck(url, config, authenticated, send = request) {
  return new Promise((resolve, reject) => {
    const body = authenticated
      ? JSON.stringify({
          model: config.model,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply OK.' }]
        })
      : undefined
    const headers = authenticated
      ? {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          ...(config.authToken ? { authorization: `Bearer ${config.authToken}` } : { 'x-api-key': config.apiKey })
        }
      : {}
    const req = send(
      url,
      {
        method: authenticated ? 'POST' : 'HEAD',
        headers,
        ...(config.extraCaCertPem ? { ca: [...rootCertificates, config.extraCaCertPem] } : {})
      },
      (response) => {
        response.destroy()
        resolve(response.statusCode)
      }
    )
    req.setTimeout(20000, () => req.destroy(Object.assign(new Error(), { code: 'ETIMEDOUT' })))
    req.once('error', reject)
    req.end(body)
  })
}

export async function diagnose(config, report, operations = { lookup, tcpCheck, httpsCheck, withTimeout }) {
  const base = new URL(config.anthropicBaseUrl)
  const endpoint = new URL(`${base.href.replace(/\/$/, '')}/v1/messages`)
  // Match the Anthropic client's base URL convention: callers supply the API root.
  const checks = [
    ['DNS', () => operations.withTimeout(operations.lookup(base.hostname))],
    ['TCP', () => operations.tcpCheck(base.hostname, Number(base.port || 443))],
    ['HTTPS', () => operations.withTimeout(operations.httpsCheck(base, config, false), 25000)],
    ['MODEL', () => operations.withTimeout(operations.httpsCheck(endpoint, config, true), 25000)]
  ]
  for (const [name, check] of checks) {
    try {
      const status = await check()
      if (name === 'MODEL' && !(status >= 200 && status < 300)) {
        report(`MODEL: failed (HTTP ${Number.isInteger(status) ? status : 'unknown'})`)
        return false
      }
      report(`${name}: passed${name === 'HTTPS' || name === 'MODEL' ? ` (HTTP ${status})` : ''}`)
    } catch (error) {
      report(`${name}: failed (${codes.has(error?.code) ? error.code : 'UNCLASSIFIED_ERROR'})`)
      return false
    }
  }
  return true
}
