# Workspace E2E tests

This directory owns Workspace browser tests, fixtures, page objects, and test
configuration. The shared `onecx-playwright` orchestrator image owns the matrix,
image verification, runtime handoff, cleanup, and reports. It wraps the existing
published `@onecx/integration-tests@0.11.1` package for platform management,
without requiring changes to that package's repository. Do not copy
orchestration scripts into this repository.

## Release prerequisites

This migration consumes the **unpublished** `onecx-playwright` release
`v0.0.3`. Publish the shared runtime/orchestrator images and reusable workflow
before enabling this workflow. No new orchestration npm-package release is
required. The new CLI is provided by the image, not the existing npm package.

Configure the repository variable `ORCHESTRATOR_IMAGE` with the published
`ghcr.io/doasdk/onecx-playwright:0.0.3-orchestrator` image, preferably pinned by
digest. `E2E_IMAGE` can override the app test image declared in
`integration.config.json`. The runtime base for the app's test Dockerfile stays
at `0.0.2`; the test-launcher contract remains compatible.

## Configuration instead of scripts

`integration.config.json` selects the app E2E image, npm test script, platform
configuration, and matrix file. Relative paths resolve from that configuration
file. `platform.json` declares platform images; `versions.json` selects the
Cartesian product of version overrides. The component-to-network-alias mapping
is explicit, so image verification does not rely on Workspace constants in the
shared runner.

Change configuration to select versions; do not edit the shared runner.
New applications supply their own tests and declarative platform configuration.
Adding a container type not supported by the toolkit requires a shared-package
change rather than another app-owned startup script.

The shared runner forwards application environment and test-data JSON without
requiring Workspace field names. Workspace's own loaders still validate its
routes and `users.onecxUser`. Supply credentials only at runtime through
`ENVIRONMENTS_JSON` / `TEST_DATA_JSON`, or their `*_FILE` counterparts. Never
include secrets in image layers, configuration committed to Git, or build args.

## Browser tests

Use Node.js 22.22.0, matching the runtime. From the repository root:

```shell
npm --prefix integration ci --include=dev --ignore-scripts --no-audit --no-fund
npm --prefix integration run tests:gui
npm --prefix integration run tests:fixtures
```

Local Playwright execution requires installed browsers and configuration for
the selected environment. `tests:gui`, `tests:a11y`, and `tests:all` at repository
root delegate to this automation package. Angular Karma/Jasmine dependencies
remain in the root package.

The npm package `onecx-common-e2e@0.0.2` owns Keycloak login, authenticated
fixtures, shell page objects, and accessibility helpers.
`e2e/fixtures/basePage.ts` provides runtime authentication options and extends
the shared fixtures with `WorkspaceManagementPage`. That fixture requests
`authenticatedPage`, so login completes before Workspace navigation.
Each test and retry has a fresh browser context and performs its own login.
No session or credentials are built into an image.

Maintain shared fixture functionality in the common E2E support repository,
publish it, then update this app's exact dependency and lockfile. Do not change
installed package code. Fixture contract tests under `verification` use simulated
pages and do not require a running OneCX platform.

## Build the app test image

The Dockerfile contains only app test-image stages. It inherits the shared
runtime launcher and installs locked test dependencies, not orchestration
dependencies.

From the repository root:

```shell
npm run image:build
npm run image:push
```

These commands use `integration.config.json`'s test image unless `E2E_IMAGE`
is set. `PLAYWRIGHT_RUNTIME_IMAGE` optionally overrides the runtime base.
Rebuild and publish the app E2E image after changing tests or dependencies.
Publishing a new shared base does not update an already-built app image.

## Platform and matrix execution

The GitHub workflow is a thin call to the shared reusable workflow. It runs the
orchestrator image and does not install orchestration tooling into this repo.
Supply `ENVIRONMENTS_JSON`, `TEST_DATA_JSON`, and, for private registries,
`DOCKER_AUTH_CONFIG` through the workflow's supported secrets.

For local Linux/WSL execution, extract the version-matched host launcher from
the published image; do not install or copy app-owned orchestration scripts.
From the repository root, with Docker available:

```shell
export ORCHESTRATOR_IMAGE=ghcr.io/doasdk/onecx-playwright:0.0.3-orchestrator
export CONFIG_PATH=integration/integration.config.json
mkdir -p .onecx-ci
id=$(docker create "$ORCHESTRATOR_IMAGE")
docker cp "$id:/opt/onecx-orchestrator/workflow-launch.sh" .onecx-ci/launch.sh
docker rm "$id"
sh .onecx-ci/launch.sh matrix
```

The output `.onecx-ci/matrix.json` contains each `runId` and
`selectionBase64`. Export those as `RUN_ID` and `MATRIX_SELECTION_BASE64`,
provide `ENVIRONMENTS_JSON` and `TEST_DATA_JSON` at runtime, then invoke
`sh .onecx-ci/launch.sh run`. After running the desired combinations, invoke
`sh .onecx-ci/launch.sh report`. Java and npm orchestration dependencies are
inside the image, not required on the host. See the shared image documentation
for configuration validation and interactive platform execution.

The former app-owned `it:*` npm wrappers and Dockerfile `orchestrator` target
have been removed. Use the shared image/workflow rather than building an
orchestrator from this app. The shared CLI retains platform-serving behavior;
its connection details are described in the shared image documentation.

## Results

The shared runner retains per-run `summary.json`, `versions.json`,
`execution.json`, raw `allure-results`, and the generated `allure-report`.
The shared workflow collects matrix outputs into a combined report and reports
missing combinations instead of silently omitting them.

The runtime contract distinguishes test failures, invalid configuration,
interruptions, and timeouts. Contract-v1 app images retain their inherited
entrypoint; the orchestrator supplies a runtime envelope and CA certificate.
Only orchestration needs Docker access, not the app E2E container.

Private capture is disabled in `integration.config.json`. Raw logs and browser
artifacts can contain credentials or user data; enable capture only for trusted
runs. Serve Allure reports over HTTP rather than opening `index.html` directly.
