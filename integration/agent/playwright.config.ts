import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
import agentConfig from '../agent.config.json'
import { reporterPath } from './harness.cjs'

const outputRoot = resolve(process.env.OUTPUT_DIR || resolve(__dirname, '../results/agent-local'))
const integrationRoot = resolve(__dirname, '..')

export default defineConfig({
  tsconfig: resolve(integrationRoot, 'tsconfig.json'),
  testDir: resolve(integrationRoot, 'agent'),
  testMatch: 'workspace.agent.spec.ts',
  timeout: 1_020_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  outputDir: resolve(outputRoot, 'test-results'),
  reporter: [
    ['line'],
    [reporterPath(), { outputRoot, requiredChecks: agentConfig.requiredChecks, suite: 'Workspace' }]
  ],
  use: {
    browserName: 'chromium',
    headless: true,
    ignoreHTTPSErrors: !!process.env.TLS_CA_CERT_PATH,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  }
})
