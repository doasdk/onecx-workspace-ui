ARG PLAYWRIGHT_RUNTIME_IMAGE=ghcr.io/doasdk/onecx-playwright:0.0.3
ARG PLAYWRIGHT_AGENT_RUNTIME_IMAGE=ghcr.io/doasdk/onecx-playwright:0.0.5-agent-runtime
FROM ${PLAYWRIGHT_RUNTIME_IMAGE} AS dependencies

LABEL description="OneCX Playwright E2E tests"

WORKDIR /app/integration

ENV CI=true

COPY integration/package.json integration/package-lock.json ./

RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund

FROM dependencies AS test-runtime

COPY integration/e2e/ ./e2e/
COPY integration/playwright.config.ts ./playwright.config.ts
COPY integration/tsconfig.json ./tsconfig.json

CMD ["tests:gui"]

FROM ${PLAYWRIGHT_AGENT_RUNTIME_IMAGE} AS agent

WORKDIR /app/integration

COPY --from=test-runtime /app/integration/ ./

COPY integration/agent/ ./agent/
COPY integration/agent.config.json ./agent.config.json
COPY integration/prompt/ ./prompt/

# Contract-v1 launchers append this path to npm scripts.
COPY integration/agent.playwright.config.ts ./playwright.config.ts

CMD ["tests:agent"]

FROM test-runtime AS e2e
