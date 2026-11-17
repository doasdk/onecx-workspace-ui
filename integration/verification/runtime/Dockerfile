ARG E2E_IMAGE=onecx-workspace-ui-e2e:local
FROM ${E2E_IMAGE}

# Exercise the app's fixture composition through the matrix executor without OneCX services.
COPY integration/verification/fixtures.spec.ts integration/verification/playwright.config.ts ./verification/
RUN printf "export { default } from './verification/playwright.config'\n" > playwright.config.ts
