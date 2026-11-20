import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { test as workspaceTest } from '../e2e/fixtures/basePage'
import { createAgentFixtures, AgentFixtures } from './harness.cjs'

export const test = workspaceTest.extend<AgentFixtures>(
  createAgentFixtures({
    chromium,
    configPath: resolve(__dirname, '../agent.config.json'),
    outputRoot: resolve(__dirname, '../results/agent-local')
  })
)
