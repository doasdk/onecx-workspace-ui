import { test } from '../../../fixtures/basePage'
import * as allure from 'allure-js-commons'

test.describe(
  'OneCX Workspace Management Accessibility Assessment',
  {
    tag: ['@a11y']
  },
  () => {
    test.beforeEach(async ({ workspaceManagementPage }) => {
      await workspaceManagementPage.navigateTo()
    })

    test('Workspace Management', async ({ navigationHeaderBar, makeAxeBuilder }) => {
      await allure.description('Checking accessibility violations for Workspace management')

      await navigationHeaderBar.verifyAccessibility(makeAxeBuilder)
    })
  }
)
