import { expect, Locator, Page } from '@playwright/test'
import * as allure from 'allure-js-commons'
import { environment } from '../../utils/data/environment'

export class WorkspaceManagementPage {
  readonly page: Page
  readonly pageHeading: Locator

  constructor(page: Page) {
    this.page = page

    this.pageHeading = page.locator('#page-header').first()
  }

  async navigateTo(): Promise<void> {
    await allure.step('Navigate to OneCX Workspace Management page and verify page loaded', async () => {
      await this.page.goto(environment.adminShell.workspaceManagementUrl)
      await allure.attachment(
        'Navigation URLs',
        [
          `ENV: ${process.env.ENV || 'local'}`,
          `Requested: ${environment.adminShell.workspaceManagementUrl}`,
          `Final: ${this.page.url()}`
        ].join('\n'),
        'text/plain'
      )
      await this.verifyPageLoaded()
    })
  }

  async verifyPageLoaded() {
    await this.page.waitForLoadState('domcontentloaded')
    await this.pageHeading.waitFor({ state: 'visible', timeout: 20000 })
    await this.verifyPageTitle()
  }

  async verifyPageTitle() {
    await allure.step('Navigate to OneCX Workspace Management page and verify page loaded', async () => {
      await expect(this.page).toHaveTitle('OneCX Workspace')
    })
  }

  async verifyHeading() {
    await allure.step('Verify that the OneCX Workspace Management page has the correct heading', async () => {
      await expect(this.pageHeading).toHaveText('Workspace Management', { timeout: 20000 })
    })
  }
}
