import { test } from '../../../fixtures/basePage'
import * as allure from 'allure-js-commons'
import { users } from '../../../utils/data/testData'

test.describe(
  'OneCX Workspace Management Accessibility Assessment',
  {
    tag: ['@a11y']
  },
  () => {
    test.beforeEach(async ({ loginPage, workspaceManagementPage }) => {
      await loginPage.navigateToLoginPage()
      await loginPage.loginToKeycloak(users.onecxUser.username, users.onecxUser.password)
      await workspaceManagementPage.navigateTo()
    })

    test('Workspace Management', async ({ navigationHeaderBar, makeAxeBuilder }) => {
      await allure.description('Checking accessibility violations for Workspace management')

      await navigationHeaderBar.verifyAccessibility(makeAxeBuilder)
    })
  }
)
