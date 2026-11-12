import { test } from '../../../fixtures/basePage'
import * as allure from 'allure-js-commons'

test.describe(
  'OneCX Workspace',
  {
    tag: ['@e2e']
  },
  () => {
    test.beforeEach(async ({ workspaceManagementPage }) => {
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
