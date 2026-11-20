import { expect } from '@playwright/test'
import { resolve } from 'node:path'
import { users } from '../e2e/utils/data/testData'
import { test } from './fixtures'
import { runBrowserAgent, recordAssessment } from './harness.cjs'

test('should assess the live Workspace page when authenticated preparation completes', async ({
  workspaceManagementPage,
  liveBrowser,
  agentEnvironment
}, testInfo) => {
  await workspaceManagementPage.navigateTo()
  await expect(workspaceManagementPage.pageHeading).toHaveText('Workspace Management')
  testInfo.annotations.push({ type: 'agent-prepared' })

  await recordAssessment(workspaceManagementPage.page, testInfo, async () => {
    const exitCode = await runBrowserAgent({
      page: workspaceManagementPage.page,
      cdpEndpoint: liveBrowser.cdpEndpoint,
      configPath: resolve(__dirname, '../agent.config.json'),
      env: agentEnvironment,
      secrets: [users.onecxUser.username, users.onecxUser.password]
    })

    expect(exitCode, 'See agent-report.json for the browser assessment.').toBe(0)
  })
})
