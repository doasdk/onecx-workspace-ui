import { expect } from '@playwright/test'
import { test as workspaceTest } from '../e2e/fixtures/basePage'

const test = workspaceTest.extend<{ platformRoutes: void }>({
  platformRoutes: [
    async ({ page }, use) => {
      await page.route('https://onecx.test/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/login') {
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
        const submission = route.request().postData()
        if (submission) {
          const credentials = new URLSearchParams(submission)
          expect(credentials.get('username')).toBe('fixture-user')
          expect(credentials.get('password')).toBe('fixture-password')
        }
        await route.fulfill({
          contentType: 'text/html',
          body: `<html lang="en"><title>OneCX Workspace - OneCX Admin</title>
                 <nav id="ocx_header" aria-label="Main">Portal</nav>
                 <h1 id="page-header">Workspace Management</h1></html>`
        })
      })
      await use()
    },
    { auto: true }
  ]
})

test('should authenticate before constructing the workspace page when it is requested', async ({
  workspaceManagementPage
}) => {
  await expect(workspaceManagementPage.page).toHaveURL('https://onecx.test/portal')
})

test('should use the authenticated test page when constructing the workspace page', async ({
  workspaceManagementPage,
  authenticatedPage
}) => {
  expect(workspaceManagementPage.page).toBe(authenticatedPage)
})

test('should navigate to the app route when workspace navigation is requested', async ({ workspaceManagementPage }) => {
  await workspaceManagementPage.navigateTo()
  await expect(workspaceManagementPage.page).toHaveURL('https://onecx.test/workspaces')
})

test('should share the workspace page when shell navigation is requested', async ({
  workspaceManagementPage,
  navigationHeaderBar
}) => {
  expect(navigationHeaderBar.page).toBe(workspaceManagementPage.page)
})
