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
`integration.config.json`. The runtime base for the app's test Dockerfile is
`0.0.3`; the test-launcher contract remains compatible.

## Configuration instead of scripts

`integration.config.json` selects the app E2E image, npm test script, platform
configuration, and matrix file. Relative paths resolve from that configuration
file. `platform.json` declares platform images; `versions.json` selects the
Cartesian product of version overrides. The component-to-network-alias mapping
is explicit, so image verification does not rely on Workspace constants in the
shared runner.

`integration.agent.config.json` extends `./integration.config.json`, inheriting
the platform, matrix, component aliases, environment, and artifact policy; it
only replaces the whole `test` section with the agent image/script/timeout.
Relative inherited paths retain the base file's directory. This requires a
new shared orchestrator image with config-inheritance support; publish and pin
that image before running the agent lane, without overwriting existing release
tags. The deterministic config remains compatible with its existing release.

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

## Prompt-driven browser lane

The handwritten Playwright tests remain unchanged. The workflow dispatch input
`suite` selects `deterministic` (the default), `agent`, or `both`. Each lane calls
the shared orchestrator independently and provisions its own platform and
matrix, so exploratory actions cannot modify the deterministic lane's data.
Selecting an agent lane opts in to model usage and its associated cost.
Agent failures and inconclusive results fail that lane; they are not converted
to passing tests.

The agent lane uses `integration.agent.config.json` and the separate Docker
target `agent`, inheriting the published shared `agent-runtime` image.
Its inherited launcher executes `tests:agent`, a fixed handwritten Playwright
wrapper under `agent`. The existing `authenticatedPage` fixture logs in, the
Workspace page object opens the target route, and a deterministic readiness check
requires the actual Workspace heading. Only then does the wrapper start a
bounded Claude Code session with Playwright MCP over stdio. Claude Code calls
the configured model gateway for inference; MCP controls Chromium on the platform Docker network.
No MCP/CDP port or Docker socket is exposed to the agent. The existing
`tests:gui`, `tests:a11y`, and `tests:all` commands still run handwritten tests,
not the agent.

The shared helper launches one private Chromium context with a loopback-only CDP
endpoint inside the E2E container. The existing fixtures and MCP use the **same
live page**; no storage-state file is exported or restored, and sessionStorage
and in-memory application state survive the handoff. The fixture stays alive
until the assessment completes. The model cannot navigate or reload the page,
open tabs, evaluate browser code, or enter login credentials. If authentication
expires, the assessment must be inconclusive rather than attempt login.

Application credentials are read only by the deterministic fixtures. They are
not placed in the prompt or forwarded in the Claude/MCP process environment;
the wrapper provides known values only to the in-process report redactor.
The browser necessarily retains the authenticated session and its permissions.
Use a restricted synthetic test account, not a production session.

### Publication and pipeline configuration

The agent lane requires the changes in the shared **`v0.0.4`** reusable workflow
and orchestrator image to be published first. The deterministic job remains
pinned to `v0.0.3`. Do not point the agent job at the old orchestrator: arbitrary
workflow environment variables are not passed to its E2E container.

Configure these repository variables:

| Variable | Purpose |
| --- | --- |
| `AGENT_ORCHESTRATOR_IMAGE` | Published `0.0.4-orchestrator` image, preferably digest-pinned |
| `AGENT_E2E_IMAGE` | Published agent image; defaults to the image in `integration.agent.config.json` |

Continue supplying `ENVIRONMENTS_JSON` and `TEST_DATA_JSON` as for deterministic
tests. The orchestrator validates runtime configuration before provisioning the
platform; no separate preflight job is required. Environment secrets take
precedence over repository secrets of the same name.

Add the separate GitHub Actions secret `AGENT_CONFIG_JSON`:

```json
{
  "anthropicBaseUrl": "https://your-approved-model-gateway.example",
  "model": "your-approved-model-id",
  "authToken": "runtime-secret"
}
```

Use exactly one of `authToken` (Bearer authentication) or `apiKey` (`x-api-key`),
according to the model gateway's authentication instructions. An optional `extraCaCertPem`
contains the corporate gateway CA in PEM format. The wrapper must trust both
the platform and corporate CA where needed; never disable gateway TLS
verification. Endpoint, model availability, tool-use compatibility, retention,
and unattended access must be confirmed with your model gateway administrator. An
arbitrary OpenAI-compatible endpoint is not sufficient for Claude Code.

The shared workflow explicitly forwards this secret to the runtime container.
Never put credentials into prompts, Docker build arguments, image layers, or
committed settings. Use synthetic accounts and non-production application data:
browser observations enter the model context even though the browser runs
inside your containers. Network policy, not a prompt, must enforce approved
egress destinations.

### Build and local execution

From the repository root:

```powershell
npm run image:agent:build
npm run image:agent:push
```

`AGENT_E2E_IMAGE` overrides only the agent image. `E2E_IMAGE` continues to select
only the deterministic image. `PLAYWRIGHT_RUNTIME_IMAGE` overrides the test base;
`PLAYWRIGHT_AGENT_RUNTIME_IMAGE` overrides the shared agent base, defaulting to
`ghcr.io/doasdk/onecx-playwright:0.0.4-agent-runtime`.
The shared image owns locked Claude Code/MCP dependencies, matching Chromium,
process isolation, tool permissions, structured verdict validation, and cleanup.
The deterministic target does not include these packages. The root application
Dockerfile is unchanged.

For local source execution against an already-running, reachable OneCX
environment, install the shared agent dependencies in a checkout of
`onecx-playwright` as described in its README. From this repository:

```powershell
npm --prefix integration ci --include=dev --ignore-scripts --no-audit --no-fund
$env:ONECX_AGENT_RUNTIME_DIR = 'C:\path\to\onecx-playwright\agent'
npm --prefix integration run tests:agent
```

`npm run tests:agent:unit` checks the wrapper and image-selection contracts
without model gateway access or a running platform.
The live-fixture contract can also be exercised against simulated login and
Workspace routes with the shared source runtime configured:

```powershell
node integration\node_modules\@playwright\test\cli.js test --config=integration\verification\agent.playwright.config.ts
```

This uses real Chromium and the existing authentication fixture, but does not
contact a model gateway.

Supply runtime environment/test-data configuration and `AGENT_CONFIG_JSON`
through the process environment, not literal shell commands saved in history.
The integration package's Chromium revision must be installed. MCP attaches
to that browser rather than launching a separate browser revision.
The same container pipeline remains Linux-based; native Windows local execution
targets a reachable environment and does not imply Windows support for the
shared platform orchestrator.

Workspace owns `agent.config.json`, the prompt, and the small fixture-based
wrapper under `agent`. It extends the existing Workspace fixture, rather than
duplicating Keycloak selectors or login logic. The same runtime URL/data resolver
and authentication fixture serve both lanes. No test source is generated by the
model: only its browser actions and observations are nondeterministic.

These consumer files are copied explicitly into the image; changing them
requires rebuilding and publishing the agent image. The agent Docker stage
replaces the root Playwright config with a re-export of the agent-only config.
Thus the inherited launcher's appended `--config /app/integration/playwright.config.ts`
still discovers only the fixed agent wrapper, not the deterministic suite.
The agent config disables automatic browser artifacts, retries, and parallelism.
The wrapper explicitly records agent-phase video and captures screenshots on
assessment failure as described below.

### Reusing the agent in another testing repository

Do not copy the generic runner, MCP launcher, or Claude dependencies. In the next
repository, inherit the published `agent-runtime` image, install that
application's locked test/authentication dependencies, and supply:

1. An `agent.config.json` selecting the prompt, required check IDs, required
   browser tools.
2. A prompt describing the exploratory journey and expected observations.
3. A fixture extending that repository's existing authenticated test using
   shared `createAgentFixtures({ chromium, configPath, outputRoot })`. It handles
   initial reports, context/page overrides, and cleanup. Call
   `runBrowserAgent` only after deterministic navigation and readiness checks.
   Keep the fixture alive until that call completes.
4. A `tests:agent` script running the fixed wrapper through an agent-only
   Playwright configuration, plus a separate integration configuration selecting
   that script and app agent image. Respect the inherited root `--config`
   launcher argument as shown in this Dockerfile.

Use the shared reusable workflow with the agent secret and a distinct artifact
prefix. Application routes, selectors, credentials schema, and prompts stay in
the consumer; generic agent execution and publication stay in `onecx-playwright`.

Allure reporting, media capture, and fixture lifecycle now live in that shared
runtime too. Do not copy their implementations into the next repository.
`agent/harness.cjs` and its declarations are a small consumer bridge; `fixtures.ts`
only connects that bridge to this application's existing base fixture. Set the
Allure `suite` option in the agent Playwright configuration; report names and
history IDs come from each handwritten test rather than hardcoded Workspace
names. `recordAssessment(page, testInfo, callback)` always records video and
captures a screenshot when the callback fails.

For the next repository, copy `agent/harness.cjs`, `agent/harness.d.cts`,
`agent/fixtures.ts`, the agent Playwright configurations, and the handwritten
scenario spec. Change only the base fixture import, scenario preparation,
prompt/check IDs, and suite label. Copy the declarative image/workflow wiring,
but keep that application's existing platform configuration and component map.
The portable starter under shared `examples/browser-agent` demonstrates these
same APIs. You still need a separately published application agent image.

For example, the next repository's scenario configuration can be:

```json
{
  "schemaVersion": 1,
  "prompt": "prompt/search.md",
  "requiredChecks": ["search-results-visible", "empty-state-recovery"],
  "requiredTools": ["browser_snapshot", "browser_click"]
}
```

The prompt must describe those exact check IDs and the desired browser journey.
The fixed wrapper is application-specific executable setup and reuses the
repository's existing authenticated fixture and page object. The shared harness
must observe successful calls to the configured browser tools before accepting
a passing assessment. A model's final claim alone is not evidence that it
actually used the browser.

### Results and boundaries

The shared runtime writes `execution.json` from the wrapper's exit status.
The new orchestrator exports the wrapper's bounded `agent-report.json`, and the
agent workflow uses a separate artifact prefix to avoid collisions when both
lanes run. The agent lane also writes `allure-results` through its dedicated
sanitized reporter. The existing orchestrator generates `allure-report`, just
as it does for the deterministic lane. The Allure SDK and reporter are installed
in the shared agent-runtime image, not copied into each application.

The Allure assessment contains the overall summary and duration, a deterministic
authentication/readiness step, one step per required check with its evidence,
and an attachment containing the sanitized `agent-report.json`. Observed
mismatches are **failed**; inconclusive observations and runtime/setup failures
are **broken**. Both fail the lane. Missing or invalid JSON is reported as
broken rather than silently omitted. These are check steps within one fixed
assessment, not generated test cases.

Every agent assessment records a WebM video from deterministic Workspace
readiness until assessment completion. Recording uses the existing page's
Playwright screencast API, so it does not recreate the authenticated context.
Failed or inconclusive assessments also attach a full-page PNG screenshot;
passing assessments do not. Videos are finalized and attached before browser
teardown. If authentication/readiness fails before the agent phase starts, no
video or screenshot is captured, keeping deterministic login out of artifacts.
Recording/capture errors fail the test rather than silently drop artifacts.

The reporter deliberately does not collect Playwright API calls, login URLs,
raw errors, stdout/stderr, Allure runtime attachments from login helpers, or
model transcripts. It accepts only the sanitized public assessment, static
preparation status, and the explicitly named agent video/failure screenshot.
Traces remain disabled. Screenshot password inputs are masked, but video and
screenshots are not otherwise redacted: they can expose application data or an
unexpected authentication redirect. Use synthetic accounts, restricted artifact
access, and appropriate retention. These media are attached to Allure, not sent
to the model.

This extraction requires rebuilding/publishing the shared agent-runtime and
orchestrator images, then the Workspace agent image. Old shared images do not
provide these APIs or inherited configuration support. Subsequent prompt-only
or Workspace preparation changes require rebuilding only the Workspace agent
image; changes to generic reporting/media require a shared-image rebuild too.
For a container run, open the exported `allure-report` over HTTP:

```bash
python3 -m http.server 8080 --directory "$WORKSPACE/results/$RUN_ID/allure-report"
```

Visit `http://localhost:8080` rather than opening `index.html` directly.
Keep `artifacts.capturePrivate` disabled: raw model output, authentication state,
and transcripts are not public test artifacts.

Prompts define required checks and permitted exploratory actions. The wrapper
must reject missing checks, malformed output, exhausted budgets, and execution
errors rather than infer a pass. Browser-tool permissions prevent source-file
generation and shell execution, but do not make an application read-only:
an allowed click can still trigger a mutation. Use accounts with appropriate
server-enforced permissions, trusted test environments, and isolated data.
Text evidence can contain application data even after known-secret redaction;
apply appropriate artifact access and retention policies.
