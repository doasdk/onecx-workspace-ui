import { expect, Page } from '@playwright/test'
import * as allure from 'allure-js-commons'
import AxeBuilder from '@axe-core/playwright'
import { logViolations } from '../../utils/helpers/allyLoggerHelper'

export class NavigationHeaderBar {
  readonly page: Page
  readonly navHeaderBarSelector: any

  constructor(page: Page) {
    this.page = page

    this.navHeaderBarSelector = '#ocx_header'
  }

  async verifyNavigationHeaderBarIsVisible() {
    await allure.step('Verify Navigation Header Bar is visible', async () => {
      await this.page.waitForSelector(this.navHeaderBarSelector, { state: 'visible', timeout: 15000 })
    })
  }

  async verifyAccessibility(makeAxeBuilder: () => AxeBuilder) {
    await allure.step('Verify accessibility of the Navigation Header Bar', async () => {
      await this.verifyNavigationHeaderBarIsVisible()

      const results = await makeAxeBuilder().include(this.navHeaderBarSelector).analyze()

      logViolations(results)
      expect(results.violations).toEqual([])
    })
  }
}
