import { expect, Locator } from '@playwright/test'
import * as allure from 'allure-js-commons'

export async function enterSecret(locator: Locator, secret: string) {
  await allure.step('Enter secret [REDACTED]', async () => {
    await expect(locator).toBeEditable()

    await locator.evaluate((element, value) => {
      if (!(element instanceof HTMLInputElement)) {
        throw new Error('Expected a secret input')
      }

      element.value = value
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }, secret)
  })
}
