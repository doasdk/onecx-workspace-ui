FROM mcr.microsoft.com/playwright:v1.64.0-noble AS dependencies

LABEL description="OneCX Playwright E2E tests"

WORKDIR /app/integration

ENV CI=true

COPY integration/package.json integration/package-lock.json ./

RUN npm ci --include=dev --ignore-scripts --no-audit --no-fund

FROM dependencies AS test-runtime

COPY integration/e2e/ ./e2e/
COPY integration/playwright.config.ts ./playwright.config.ts
COPY integration/tsconfig.json ./tsconfig.json

# Copy the container startup script
COPY integration/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["tests:gui"]

FROM test-runtime AS orchestrator

COPY --from=docker:27.5.1-cli /usr/local/bin/docker /usr/local/bin/docker
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /run/secrets /root/.docker

COPY integration/scripts/ ./scripts/
COPY integration/platform.json integration/versions.json ./

RUN node scripts/patch-keycloak-startup.mjs \
    && node scripts/patch-service-health.mjs \
    && node scripts/patch-ui-cors.mjs

ENTRYPOINT ["node", "/app/integration/scripts/run-platform.mjs"]
CMD []

FROM test-runtime AS e2e
