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
`onecx-common-e2e` is installed from the npm registry, so local, CI, and Docker
installs do not require an external local tarball.

`integration` is the automation root: `playwright.config.ts` selects tests from
`e2e/tests`, and `tsconfig.json` covers both the Playwright configuration and all
E2E TypeScript files. Do not put duplicate configuration files under `e2e`.
The E2E and orchestrator images preserve this layout at `/app/integration`.
The repository-root `tests:gui`, `tests:a11y`, and `tests:all` commands delegate to
the automation package, including any arguments passed after `--`. Local test
artifacts default to the `integration` directory unless `OUTPUT_DIR` is set.
Runtime environment and test-data files remain under `e2e/utils/config`, or can
be supplied through the runtime configuration environment variables.
The image bootstrap also accepts legacy layouts in previously published E2E
images; these compatibility paths are not additional repository configurations.

The local Playwright command requires browser installations and runtime configuration
for the selected environment. The integration workflow runs the tests in the published
`E2E_IMAGE` instead, which includes Playwright browsers and automation dependencies.
It installs the automation package on the runner for platform orchestration and reporting;
it does not install the Angular application.
Each integration run generates an Allure report in `results/<run-id>/allure-report`,
regardless of the private-artifact capture setting. The workflow uploads this directory
as part of its run results artifact, and the combined matrix index links to each report.
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
