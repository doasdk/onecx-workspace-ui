FROM mcr.microsoft.com/playwright:v1.64.0-noble AS dependencies

LABEL description="OneCX Playwright E2E tests"

WORKDIR /app

ENV CI=true

COPY package.json package-lock.json ./

RUN npm ci --include=dev

FROM dependencies AS test-runtime

COPY integration/e2e/ ./integration/e2e/

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

COPY integration/scripts/ ./integration/scripts/
COPY integration/platform.json integration/versions.json ./integration/

ENTRYPOINT ["node", "/app/integration/scripts/run-platform.mjs"]
CMD []

FROM test-runtime AS e2e
