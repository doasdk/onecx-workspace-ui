import { WorkspaceManagementPage } from '../page-objects/admin-shell/WorkspaceManagementPage'
import { KeycloakLoginPage, NavigationHeaderBar } from 'onecx-common-e2e'

import { test as base } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { environment } from '../utils/data/environment'

type Fixtures = {
  loginPage: KeycloakLoginPage
  workspaceManagementPage: WorkspaceManagementPage
  navigationHeaderBar: NavigationHeaderBar
  makeAxeBuilder: () => AxeBuilder
}

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new KeycloakLoginPage(page, environment.adminShell.loginUrl))
  },

  workspaceManagementPage: async ({ page }, use) => {
    await use(new WorkspaceManagementPage(page))
  },

  navigationHeaderBar: async ({ page }, use) => {
    await use(new NavigationHeaderBar(page))
  },

  makeAxeBuilder: async ({ page }, use) => {
    await use(() => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']))
  }
})
