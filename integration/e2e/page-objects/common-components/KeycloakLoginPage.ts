import { expect, Locator, Page } from '@playwright/test'
import * as allure from 'allure-js-commons'
import { environment } from '../../utils/data/environment'

export class KeycloakLoginPage {
  readonly page: Page

  readonly header: Locator
  readonly headerWrapper: Locator

  readonly loginForm: Locator
  readonly usernameInput: Locator
  readonly passwordInput: Locator
  readonly signInButton: Locator
  readonly showPasswordButton: Locator

  readonly usernameLabel: Locator
  readonly passwordLabel: Locator

  readonly usernameErrorContainer: Locator
  readonly passwordErrorContainer: Locator

  readonly pageTitle: Locator

  constructor(page: Page) {
    this.page = page

    this.header = page.locator('#kc-header')
    this.headerWrapper = page.locator('#kc-header-wrapper')

    this.loginForm = page.locator('#kc-form-login')
    this.usernameInput = page.locator('#username')
    this.passwordInput = page.locator('#password')
    this.signInButton = page.locator('#kc-login')
    this.showPasswordButton = page.locator('[data-password-toggle]')

    this.usernameLabel = page.locator('label[for="username"]')
    this.passwordLabel = page.locator('label[for="password"]')

    this.usernameErrorContainer = page.locator('#input-error-container-username')
    this.passwordErrorContainer = page.locator('#input-error-container-password')

    this.pageTitle = page.locator('#kc-page-title')
  }

  async navigateToLoginPage(): Promise<void> {
    await allure.step('Navigate to OneCX portal', async () => {
      await this.navigateTo()
      await this.verifyPageLoaded()
    })
  }

  async loginToKeycloak(username: string, password: string): Promise<void> {
    await allure.step('Login to OneCX via Keycloak', async () => {
      await this.enterUsername(username)
      await this.enterPassword(password)
      await this.clickSignInButton()

      await this.verifyLoginSuccessful()
    })
  }

  async navigateTo() {
    await allure.step(`Navigate to Keycloak login page: ${environment.adminShell.loginUrl}`, async () => {
      await this.page.goto(environment.adminShell.loginUrl)
      await allure.attachment(
        'Navigation URLs',
        [
          `ENV: ${process.env.ENV || 'local'}`,
          `Requested: ${environment.adminShell.loginUrl}`,
          `Final: ${this.page.url()}`
        ].join('\n'),
        'text/plain'
      )
    })
  }

  async verifyPageLoaded() {
    await allure.step('Verify Keycloak login page loaded', async () => {
      await this.page.waitForLoadState('domcontentloaded')
      await this.headerWrapper.waitFor({ state: 'visible', timeout: 20000 })
      await expect(this.headerWrapper).toBeVisible()
    })
  }

  async enterUsername(username: string) {
    await allure.step('Enter username', async () => {
      await this.usernameInput.fill(username)
    })
  }

  async enterPassword(password: string) {
    await allure.step(`Enter password`, async () => {
      await this.passwordInput.fill(password)
    })
  }

  async clickSignInButton() {
    await allure.step('Click Sign In button', async () => {
      await this.signInButton.click()
    })
  }

  async verifyLoginSuccessful(): Promise<void> {
    await allure.step('Verify login successful', async () => {
      await this.page.waitForLoadState('domcontentloaded')
      await this.verifyLoginFormNotVisible()
      await expect(this.page).not.toHaveURL(environment.adminShell.loginUrl)
    })
  }

  async verifyLoginFormNotVisible(): Promise<void> {
    await allure.step('Check if login form is not visible', async () => {
      await expect(this.loginForm).not.toBeVisible({ timeout: 10000 })
    })
  }

  async waitForPage(): Promise<void> {
    await allure.step('Wait for Keycloak login page to be visible', async () => {
      await this.page.waitForLoadState('domcontentloaded')
      await this.loginForm.waitFor({ state: 'visible', timeout: 30000 })
    })
  }

  async getRealmName(): Promise<string> {
    return this.headerWrapper.innerText()
  }

  async getPageTitle(): Promise<string> {
    return this.pageTitle.innerText()
  }

  async hasUsernameError(): Promise<boolean> {
    const content = await this.usernameErrorContainer.textContent()
    return content !== null && content.trim().length > 0
  }

  async hasPasswordError(): Promise<boolean> {
    const content = await this.passwordErrorContainer.textContent()
    return content !== null && content.trim().length > 0
  }

  async togglePasswordVisibility(): Promise<void> {
    await this.showPasswordButton.click()
  }

  async isPasswordVisible(): Promise<boolean> {
    const type = await this.passwordInput.getAttribute('type')
    return type === 'text'
  }
}
