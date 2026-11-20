import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { imageCommand, resolveTestImage } from './image-management.mjs'

if (![3, 4].includes(process.argv.length)) {
  throw new Error('Usage: node integration/scripts/image-command.mjs <build|push> [e2e|agent]')
}
const target = process.argv[3] || 'e2e'
const args = imageCommand(
  process.argv[2],
  resolveTestImage(process.env, target),
  process.env.PLAYWRIGHT_RUNTIME_IMAGE,
  target,
  process.env.PLAYWRIGHT_AGENT_RUNTIME_IMAGE
)
console.log(`docker ${args.join(' ')}`)
const result = spawnSync('docker', args, {
  cwd: fileURLToPath(new URL('../../', import.meta.url)),
  stdio: 'inherit'
})
if (result.error) throw result.error
if (result.signal) throw new Error(`Docker interrupted by ${result.signal}.`)
process.exitCode = result.status ?? 1
