import { test } from '../../../fixtures/basePage'
import * as allure from 'allure-js-commons'
import { users } from '../../../utils/data/testData'

test.describe(
  'OneCX Workspace',
  {
    tag: ['@e2e']
  },
  () => {
    test.beforeEach(async ({ loginPage, workspaceManagementPage }) => {
      await loginPage.navigateToLoginPage()
      await loginPage.loginToKeycloak(users.onecxUser.username, users.onecxUser.password)
      await workspaceManagementPage.navigateTo()
    })

    test(
      'UC-001 should have a correct title',
      {
        tag: ['@gui', '@admin-shell']
      },
      async ({ workspaceManagementPage }) => {
        await allure.description('Verify that the OneCX Workspace Management page has the correct title')

        await workspaceManagementPage.verifyPageTitle()
      }
    )

    test(
      'UC-002 should display correct heading',
      {
        tag: ['@gui']
      },
      async ({ workspaceManagementPage }) => {
        await allure.description('Verify that the OneCX Workspace Management page has the correct heading')
        await workspaceManagementPage.verifyHeading()
      }
    )
  }
)
