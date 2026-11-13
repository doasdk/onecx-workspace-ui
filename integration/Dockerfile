ARG PLAYWRIGHT_RUNTIME_IMAGE=ghcr.io/doasdk/onecx-playwright:0.0.3
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

FROM test-runtime AS e2e
