# onecx-workspace-ui

OneCX Workspace UI

## Automation tests

Automation dependencies are managed separately in `integration/package.json` and
`integration/package-lock.json`. Use Node.js 22.22.0, matching the integration workflow.
From the repository root:

```shell
npm --prefix integration ci --include=dev --ignore-scripts --no-audit --no-fund
npm --prefix integration run tests:gui
```

The local Playwright command requires browser installations and runtime configuration
for the selected environment. The integration workflow runs the tests in the published
`E2E_IMAGE` instead, which includes Playwright browsers and automation dependencies.
It installs the automation package on the runner for platform orchestration and reporting;
it does not install the Angular application.

Build and publish the test image from the repository root with `E2E_IMAGE` set:

```shell
npm --prefix integration run image:build
npm --prefix integration run image:push
```

The image build uses `integration/Dockerfile` and the automation lockfile. Rebuild and
publish the image after changing automation dependencies or tests, and configure the
workflow's `E2E_IMAGE` variable to reference the published image. The Dockerfile's
`orchestrator` target also includes the platform scripts and compatibility patches.
