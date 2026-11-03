const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const input = JSON.parse(fs.readFileSync('/tmp/onecx-runtime.json', 'utf8'))
const configs = ['/app/playwright.config.ts', '/app/integration/e2e/playwright.config.ts'].filter((file) =>
  fs.existsSync(file)
)
if (configs.length !== 1) throw new Error('Expected exactly one supported Playwright config in the E2E image.')
const original = configs[0]
const packageDirectory = ['/app/integration', '/app'].find((directory) =>
  fs.existsSync(path.join(directory, 'package.json'))
)
if (!packageDirectory) throw new Error('Expected an automation package manifest in the E2E image.')
const directory = path.dirname(original)
const configDirectory = path.join(directory, 'utils', 'config')
fs.mkdirSync(configDirectory, { recursive: true, mode: 0o700 })
const shell = input.environments[input.environment].adminShell
const oldOrigin = new URL(shell.baseUrl).origin
function rebase(value, login) {
  const url = new URL(value, input.metadata.e2e.baseUrl)
  const originalOrigin = new URL(value, shell.baseUrl).origin
  const target = new URL(
    login && originalOrigin !== oldOrigin ? input.metadata.e2e.keycloakUrl : input.metadata.e2e.baseUrl
  )
  url.protocol = target.protocol
  url.host = target.host
  if (url.searchParams.has('redirect_uri')) {
    const redirect = new URL(url.searchParams.get('redirect_uri'))
    const base = new URL(input.metadata.e2e.baseUrl)
    redirect.protocol = base.protocol
    redirect.host = base.host
    url.searchParams.set('redirect_uri', redirect.toString())
  }
  return url.toString()
}
shell.loginUrl = rebase(shell.loginUrl, true)
shell.workspaceManagementUrl = rebase(shell.workspaceManagementUrl, false)
shell.baseUrl = input.metadata.e2e.baseUrl
fs.writeFileSync(path.join(configDirectory, 'environments.json'), JSON.stringify(input.environments), { mode: 0o600 })
fs.writeFileSync(path.join(configDirectory, 'data.json'), JSON.stringify(input.data), { mode: 0o600 })
fs.mkdirSync('/e2e-results', { recursive: true })
// Keep image-owned tests/dependencies, but enforce runtime URLs, TLS and capture policy.
const wrapper = path.join(directory, 'onecx-runtime.config.ts')
fs.writeFileSync(
  wrapper,
  `
const original = require(${JSON.stringify(original)});
const config = original.default || original;
export default {
  ...config,
  testDir: require('node:path').resolve(${JSON.stringify(directory)}, config.testDir || 'tests'),
  outputDir: '/e2e-results/test-results',
  reporter: [['line'], ['allure-playwright', { resultsDir: '/e2e-results/allure-results' }]],
  use: {
    ...config.use,
    baseURL: ${JSON.stringify(input.metadata.e2e.baseUrl)},
    ignoreHTTPSErrors: true,
    trace: ${JSON.stringify(input.capture ? 'on-first-retry' : 'off')},
    screenshot: ${JSON.stringify(input.capture ? 'only-on-failure' : 'off')},
    video: 'off',
  },
};
`
)
const command = spawnSync('npm', ['run', input.script, '--', `--config=${wrapper}`], {
  cwd: packageDirectory,
  env: {
    ...process.env,
    CI: 'true',
    ENV: input.environment,
    OUTPUT_DIR: '/e2e-results',
    BASE_URL: shell.baseUrl,
    TLS_CA_CERT_PATH: '/tmp/onecx-ca.pem',
    NODE_EXTRA_CA_CERTS: '/tmp/onecx-ca.pem',
    PLATFORM_INFO_JSON: JSON.stringify(input.metadata)
  },
  stdio: 'inherit'
})
if (command.error) throw command.error
process.exit(command.status ?? 1)
