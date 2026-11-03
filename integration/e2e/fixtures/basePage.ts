// import {test as base} from '@playwright/test';
//
import { WorkspaceManagementPage } from '../page-objects/admin-shell/WorkspaceManagementPage'
import { KeycloakLoginPage } from '../page-objects/common-components/KeycloakLoginPage'
import { NavigationHeaderBar } from '../page-objects/common-components/NavigationHeaderBar'
//
// export const test = base.extend<{
//     loginPage: KeycloakLoginPage;
//     workspaceManagementPage: WorkspaceManagementPage;
//     navigationHeaderBar:NavigationHeaderBar;
//
// }>({
//     loginPage: async ({ page }, use) => {
//         await use(new KeycloakLoginPage(page));
//     },
//     workspaceManagementPage: async ({ page }, use) => {
//         await use(new WorkspaceManagementPage(page));
//     },
//     navigationHeaderBar: async ({ page }, use) => {
//         await use(new NavigationHeaderBar(page));
//     },
// });

import { test as base } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

type Fixtures = {
  loginPage: KeycloakLoginPage
  workspaceManagementPage: WorkspaceManagementPage
  navigationHeaderBar: NavigationHeaderBar
  makeAxeBuilder: () => AxeBuilder
}

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new KeycloakLoginPage(page))
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
