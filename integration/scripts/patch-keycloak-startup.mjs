import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const packageRoot = dirname(require.resolve('@onecx/integration-tests'))
const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
if (metadata.version !== '0.11.1') {
  throw new Error(
    `Keycloak compatibility patch supports @onecx/integration-tests 0.11.1 only; found ${metadata.version}. Review the patch before upgrading.`
  )
}

const file = join(packageRoot, 'lib', 'containers', 'core', 'onecx-keycloak.js')
const source = readFileSync(file, 'utf8')
const realmFile = join(packageRoot, 'assets', 'keycloak', 'realm-onecx.json')
const realmSource = readFileSync(realmFile, 'utf8')
const realm = JSON.parse(realmSource)
if (
  realm.realm !== 'onecx' ||
  !realm.attributes ||
  (Object.hasOwn(realm.attributes, 'frontendUrl') && realm.attributes.frontendUrl !== 'http://keycloak-app:8080')
) {
  throw new Error('Unexpected Keycloak realm frontend URL. Refusing to apply compatibility patch.')
}
let patchedRealm = realmSource
if (Object.hasOwn(realm.attributes, 'frontendUrl')) {
  const override = '    "frontendUrl": "http://keycloak-app:8080",'
  if (realmSource.split(override).length - 1 !== 1) {
    throw new Error('Unexpected Keycloak realm format. Refusing to apply compatibility patch.')
  }
  // Let KC_HOSTNAME define the browser-facing URLs instead of this stale HTTP override.
  patchedRealm = realmSource.replace(override, '')
  JSON.parse(patchedRealm)
}
const changes = [
  {
    before:
      ".withCommand(['start-dev', '--import-realm']).withNetworkAliases('keycloak-app').withStartupTimeout(120_000);",
    after:
      ".withCommand(['start-dev', '--import-realm']).withNetworkAliases('keycloak-app').withStartupTimeout(300_000);"
  },
  {
    before: '            interval: 10_000,\n            timeout: 5_000,\n            retries: 10,',
    after:
      '            interval: 10_000,\n            timeout: 5_000,\n            startPeriod: 120_000,\n            retries: 12,'
  }
]
let patched = source.replace(/\r\n/g, '\n')
const applied = changes.map(({ before, after }) => {
  const beforeCount = patched.split(before).length - 1
  const afterCount = patched.split(after).length - 1
  if (beforeCount === 1 && afterCount === 0) return false
  if (beforeCount === 0 && afterCount === 1) return true
  throw new Error('Unexpected Keycloak implementation. Refusing to apply startup patch.')
})
if (applied.some(Boolean) && !applied.every(Boolean)) {
  throw new Error('Partially applied Keycloak startup patch. Restore dependencies with npm ci.')
}
if (!applied.every(Boolean)) {
  for (const { before, after } of changes) patched = patched.replace(before, after)
  writeFileSync(file, patched)
}
if (patchedRealm !== realmSource) writeFileSync(realmFile, patchedRealm)
console.log(
  'Keycloak startup patch active: timeout=300s, startPeriod=120s, interval=10s, check timeout=5s, retries=12.'
)
console.log('Keycloak realm patch active: browser URLs inherit HTTPS KC_HOSTNAME; stale HTTP frontendUrl removed.')
