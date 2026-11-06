import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'
import { environment } from './e2e/utils/data/environment'
import * as path from 'node:path'

const outputRoot = path.resolve(process.env.OUTPUT_DIR || '.')
const capturePrivateArtifacts = process.env.CAPTURE_PRIVATE_ARTIFACTS === 'true'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  tsconfig: './tsconfig.json',
  timeout: 60000, // time for tests to finish
  testDir: './e2e/tests',
  outputDir: path.join(outputRoot, 'test-results'),
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  // reporter: 'html',
  reporter: [['line'], ['allure-playwright', { resultsDir: path.join(outputRoot, 'allure-results') }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    baseURL: environment.adminShell.baseUrl,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: capturePrivateArtifacts ? 'on-first-retry' : 'off',

    //allure reporter configuration
    screenshot: capturePrivateArtifacts ? 'only-on-failure' : 'off',
    video: 'on',
    // The platform CA is injected at runtime. Browser TLS bypass is scoped to platform runs.
    ignoreHTTPSErrors: !!process.env.TLS_CA_CERT_PATH
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI ? {} : { channel: 'chrome' })
      }
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ]

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
})
