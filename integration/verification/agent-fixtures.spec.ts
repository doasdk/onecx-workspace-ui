import { expect } from '@playwright/test'
import { test as agentTest } from '../agent/fixtures'

const test = agentTest.extend<{ platformRoutes: void }>({
  platformRoutes: [
    async ({ page }, use) => {
      await page.route('https://onecx.test/**', async (route) => {
        const request = route.request()
        if (new URL(request.url()).pathname === '/login') {
          await route.fulfill({
            contentType: 'text/html',
            body: `<div id="kc-header-wrapper">OneCX</div>
                   <form id="kc-form-login" action="/portal" method="post">
                     <input id="username" name="username">
                     <input id="password" name="password" type="password">
                     <button id="kc-login" type="submit">Sign in</button>
                   </form>`
          })
          return
        }
        if (request.method() === 'POST') {
          const credentials = new URLSearchParams(request.postData() || '')
          expect(credentials.get('username')).toBe('fixture-user')
          expect(credentials.get('password')).toBe('fixture-password')
        }
        await route.fulfill({
          contentType: 'text/html',
          body: `<html lang="en"><title>OneCX Workspace</title>
                 <h1 id="page-header">Workspace Management</h1></html>`
        })
      })
      await use()
    },
    { auto: true }
  ]
})

test('should reuse the live page when the existing authenticated fixture logs in', async ({
  workspaceManagementPage,
  authenticatedPage,
  liveBrowser
}) => {
  expect(workspaceManagementPage.page).toBe(liveBrowser.page)
  expect(authenticatedPage).toBe(liveBrowser.page)
  await expect(liveBrowser.page).toHaveURL('https://onecx.test/portal')
})

test('should keep one authenticated page when deterministic Workspace preparation completes', async ({
  workspaceManagementPage,
  liveBrowser
}) => {
  await workspaceManagementPage.navigateTo()
  await workspaceManagementPage.verifyHeading()
  expect(liveBrowser.context.pages()).toEqual([workspaceManagementPage.page])
})
