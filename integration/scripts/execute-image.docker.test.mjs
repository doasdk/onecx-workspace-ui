import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { executeImage } from './execute-image.mjs'

test(
  'should run Workspace shared fixtures through the inherited matrix launcher',
  {
    skip: process.env.RUN_DOCKER_TESTS !== 'true',
    timeout: 120000
  },
  async () => {
    const root = mkdtempSync(join(tmpdir(), 'onecx-runtime-contract-'))
    const network = `onecx-runtime-contract-${randomUUID()}`
    const secretDir = join(root, 'secrets')
    const runDir = join(root, 'run')
    mkdirSync(secretDir)
    mkdirSync(join(runDir, 'e2e'), { recursive: true })
    writeFileSync(join(runDir, 'e2e', 'ca.pem'), readFileSync('/etc/ssl/certs/ca-certificates.crt'))
    execFileSync('docker', ['network', 'create', network], { stdio: 'ignore' })
    try {
      const records = await executeImage({
        image: process.env.RUNTIME_VERIFICATION_IMAGE || 'onecx-workspace-runtime-verification:local',
        metadata: {
          network: { id: network },
          e2e: { baseUrl: 'https://onecx.test', keycloakUrl: 'https://onecx.test' }
        },
        environments: { container: {} },
        data: {},
        environment: 'container',
        script: 'tests:all',
        capture: false,
        secretDir,
        runDir,
        alias: 'verification',
        timeoutMs: 90000,
        onContainer: () => {}
      })
      const output = join(runDir, 'e2e-results', 'verification')
      assert.equal(records[0].status, 'success')
      const manifest = JSON.parse(readFileSync(join(output, 'execution.json'), 'utf8'))
      assert.equal(manifest.version, 1)
      assert.equal(manifest.status, 'success')
      const results = readdirSync(join(output, 'allure-results')).filter((file) => file.endsWith('-result.json'))
      assert.equal(results.length, 12)
      for (const file of results) {
        const result = JSON.parse(readFileSync(join(output, 'allure-results', file), 'utf8'))
        assert.equal(result.status, 'passed')
        assert.ok(result.steps.length > 0)
      }
    } finally {
      execFileSync('docker', ['network', 'rm', network], { stdio: 'ignore' })
      rmSync(root, { recursive: true, force: true })
    }
  }
)
