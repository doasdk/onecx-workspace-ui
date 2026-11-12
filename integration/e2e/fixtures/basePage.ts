import { test as base } from 'onecx-common-e2e'
import { WorkspaceManagementPage } from '../page-objects/admin-shell/WorkspaceManagementPage'
import { environment } from '../utils/data/environment'
import { users } from '../utils/data/testData'

type Fixtures = {
  workspaceManagementPage: WorkspaceManagementPage
}

export const test = base.extend<Fixtures>({
  authentication: {
    loginUrl: environment.adminShell.loginUrl,
    username: users.onecxUser.username,
    password: users.onecxUser.password
  },

  workspaceManagementPage: async ({ authenticatedPage }, use) => {
    await use(new WorkspaceManagementPage(authenticatedPage))
  }
})
