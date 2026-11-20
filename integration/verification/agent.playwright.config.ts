import { defineConfig } from '@playwright/test'
import fixtureConfig from './playwright.config'

export default defineConfig({
  ...fixtureConfig,
  testMatch: 'agent-fixtures.spec.ts',
  reporter: [['line']],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  use: { trace: 'off', screenshot: 'off', video: 'off' }
})
