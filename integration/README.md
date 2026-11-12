# onecx-workspace-ui

OneCX Workspace UI

## Automation tests

Automation dependencies are managed separately in `package.json` and
`package-lock.json`. Use Node.js 22.22.0, matching the integration workflow.
From the repository root:

```shell
npm --prefix integration ci --include=dev --ignore-scripts --no-audit --no-fund
npm --prefix integration run tests:gui
```

Add or update E2E dependencies from the repository root with
`npm --prefix integration install --save-dev <package>`, not a root-level install.
Angular unit-test dependencies (Karma and Jasmine) remain in the root package.
`onecx-common-e2e` is pinned to version `0.0.2` from the npm registry.
Local, CI, and Docker installs use the automation lockfile; no vendored archive
or external local checkout is required.

### Browser-test responsibilities

The shared package owns Keycloak login, test-scoped authentication, shell page
objects, generic helpers, and the WCAG axe-builder fixture.
`e2e/fixtures/basePage.ts` supplies runtime authentication options and extends
the shared fixtures with `WorkspaceManagementPage`. That app page object requests
`authenticatedPage`, so login completes before workspace tests or navigation run.
The app's hooks only navigate to the workspace page; they do not implement login.

Each test (and retry) retains a fresh browser context and performs its own login,
as before. No session is built into an image or reused between matrix runs.
Authentication failures fail fixture setup. Login/public-page tests can request
the shared `page` or `loginPage` without requesting `authenticatedPage`.
Shell navigation and axe fixtures use the same test page; they do not log in
independently.

The app owns workspace routes, runtime user selection, workspace page objects,
business assertions, and platform/version selections. Platform startup, image
verification, runtime bootstrap, and reporting remain in the existing scripts
and `@onecx/integration-tests`; this change does not extract that orchestration
into a new shared runner. The dedicated runtime owns the common launch contract,
runner/configuration/CA/output validation, signal forwarding, and execution
classification. Authentication remains in shared Playwright fixtures, not in
the image launcher.

The Dockerfile defaults to the published `ghcr.io/doasdk/onecx-playwright:0.0.2`
runtime by tag. Set `PLAYWRIGHT_RUNTIME_IMAGE` before running
`image:build` (or supply Docker build argument `PLAYWRIGHT_RUNTIME_IMAGE`) to
override it for local development. New images must derive from a runtime with
contract v1.
This does not change the shared npm package version or preinstall npm modules
in the base image.

### Matrix runtime contract

The orchestrator inspects the E2E image's `org.onecx.playwright.contract` label.
Contract `1` retains the inherited ENTRYPOINT and receives a versioned runtime
envelope through `ONECX_RUNTIME_FILE`, copied into the created container along
with its CA certificate. The envelope carries app configuration as opaque
environment strings; the runtime has no knowledge of Workspace routes/users.
The app's existing environment loader resolves platform URLs, and its reporter
uses `OUTPUT_DIR`. No credentials or sessions are included in image layers.

All execution modes (host runner, CI, and Docker orchestrator) use the same
image executor. It does not inject executable bootstrap code into contract-v1
images. The runtime validates and invokes the app's npm script/config, writes
`execution.json`, and propagates the process exit status. Configuration failure,
test failure, interruption, and timeout are reported distinctly; test assertion
failures are no longer mislabeled as container startup failures.

Previously published images without the contract label use the existing legacy
bootstrap with an explicit warning. Unknown contract versions fail rather than
silently selecting legacy behavior. Rebuild app images to adopt the new runtime;
publishing the base image alone does not update existing E2E images.

The executor uses Docker init and always removes its test container after copying
results. The Docker socket is needed by orchestration, not by the E2E container.
Raw logs remain private unless explicitly enabled; the Docker launcher prints
safe run/container identifiers instead of streaming credentials-bearing logs.

`npm --prefix integration run tests:fixtures` exercises the package-to-app fixture
contract against browser-routed HTML, without starting OneCX or using real
credentials. Its isolated configuration under `verification` is only for these contract
tests; the platform still runs `playwright.config.ts` and `e2e/tests`.

An optional Docker verification consumer under `verification/runtime` checks the
exact matrix launcher -> runtime -> shared fixtures -> app page object -> Allure
chain without real platform credentials. Build the app E2E image first, then:

```shell
docker build -f integration/verification/runtime/Dockerfile \
  -t onecx-workspace-runtime-verification:local .
RUN_DOCKER_TESTS=true node --test integration/scripts/execute-image.docker.test.mjs
```

Run the Docker test in Linux with Docker CLI access (or the Docker orchestrator,
which already includes it). It creates and removes only its own isolated network
and E2E container. It uses simulated pages and a public system CA, not secret
configuration. Other script tests do not invoke Docker.

Maintain shared functionality in the common E2E support repository. After testing
and publishing a new package version, update this app's exact dependency and
lockfile and rebuild/publish its E2E image. Do not modify installed package code.

`integration` is the automation root: `playwright.config.ts` selects tests from
`e2e/tests`, and `tsconfig.json` covers both the Playwright configuration and all
E2E TypeScript files. Do not put duplicate configuration files under `e2e`.
The E2E and orchestrator images preserve this layout at `/app/integration`.
The repository-root `tests:gui`, `tests:a11y`, and `tests:all` commands delegate to
the automation package, including any arguments passed after `--`. Local test
artifacts default to the `integration` directory unless `OUTPUT_DIR` is set.
Runtime environment and test-data files remain under `e2e/utils/config`, or can
be supplied through the runtime configuration environment variables.
The legacy image bootstrap also accepts older layouts in previously published E2E
images; these compatibility paths are not additional repository configurations.

The local Playwright command requires browser installations and runtime configuration
for the selected environment. The integration workflow runs the tests in the published
`E2E_IMAGE` instead, which includes Playwright browsers and automation dependencies.
It installs the automation package on the runner for platform orchestration and reporting;
it does not install the Angular application.
Each integration run generates an Allure report in `results/<run-id>/allure-report`,
regardless of the private-artifact capture setting. The workflow uploads this directory
as part of its run results artifact, and the combined matrix index links to each report.
For contract-v1 images, the safe `execution.json` status manifest is exported beside
`summary.json`; Allure results and report merging retain their existing paths.
The raw `allure-results` are kept per run, and the `collect_reports` job merges them into one
report at `combined-allure-report` in the `matrix-reports-*` artifact. `it:test:matrix` builds
the same report locally at `results/<batch>/combined-allure-report`. The Suites view groups
tests as `integration-job-0001` > `chromium`, `firefox`, or `webkit` > executed tests,
with one numbered job per matrix combination in matrix order. Missing results do not
renumber later jobs and are reported in the collection logs.
Allure suite dropdowns do not support descriptions. Each test's description instead includes
a compact mapping of component names to requested image versions. Full version/image
provenance remains available as a `versions.json` attachment. Existing test descriptions
and attachments are preserved.
Serve the report over HTTP (for example `npx allure open <dir>`) rather than opening
`index.html` directly.

Build and publish the test image from the repository root with `E2E_IMAGE` set:

```shell
npm --prefix integration run image:build
npm --prefix integration run image:push
```

The image build uses `Dockerfile` and the automation lockfile. Rebuild and
publish the image after changing automation dependencies or tests, and configure the
workflow's `E2E_IMAGE` variable to reference the published image. The Dockerfile's
`orchestrator` target also includes the platform scripts and compatibility patches.
