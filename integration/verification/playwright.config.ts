import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const outputRoot = resolve(process.env.OUTPUT_DIR || resolve(__dirname, '..'))
process.env.ENV = 'fixture-contract'
process.env.ENVIRONMENTS_JSON_FILE = ''
process.env.TEST_DATA_JSON_FILE = ''
process.env.PLATFORM_INFO_JSON = ''
process.env.BASE_URL = ''
process.env.ENVIRONMENTS_JSON = JSON.stringify({
  'fixture-contract': {
    adminShell: {
      baseUrl: 'https://onecx.test',
      loginUrl: 'https://onecx.test/login',
      workspaceManagementUrl: 'https://onecx.test/workspaces'
    }
  }
})
process.env.TEST_DATA_JSON = JSON.stringify({
  users: { onecxUser: { username: 'fixture-user', password: 'fixture-password' } }
})

export default defineConfig({
  testDir: __dirname,
  testMatch: 'fixtures.spec.ts',
  outputDir: resolve(outputRoot, 'test-results/fixtures'),
  reporter: [
    ['line'],
    [
      'allure-playwright',
      {
        resultsDir: resolve(outputRoot, process.env.OUTPUT_DIR ? 'allure-results' : 'allure-results/fixtures')
      }
    ]
  ],
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } }
  ]
})
