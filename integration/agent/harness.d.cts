import type {
  BrowserContext,
  BrowserContextOptions,
  BrowserType,
  Page,
  TestInfo,
  Fixtures,
  PlaywrightTestArgs,
  PlaywrightWorkerArgs
} from '@playwright/test'

export type LiveBrowser = {
  page: Page
  context: BrowserContext
  cdpEndpoint: string
  close(): Promise<void>
}

export function createLiveBrowser(options: {
  chromium: BrowserType
  contextOptions: BrowserContextOptions
  env: NodeJS.ProcessEnv
}): Promise<LiveBrowser>

export function runBrowserAgent(options: {
  page: Page
  cdpEndpoint: string
  configPath: string
  env: NodeJS.ProcessEnv
  secrets: string[]
}): Promise<number>

export function initializeAgentReport(options: { configPath: string; env: NodeJS.ProcessEnv }): Promise<void>
export function recordAssessment(page: Page, testInfo: TestInfo, assess: () => Promise<void>): Promise<void>
export function reporterPath(): string
export type AgentFixtures = { liveBrowser: LiveBrowser; agentEnvironment: NodeJS.ProcessEnv }
export function createAgentFixtures(options: {
  chromium: BrowserType
  configPath: string
  outputRoot: string
}): Fixtures<AgentFixtures, {}, PlaywrightTestArgs, PlaywrightWorkerArgs>
