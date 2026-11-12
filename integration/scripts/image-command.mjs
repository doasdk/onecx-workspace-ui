import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { imageCommand, resolveTestImage } from './test-image-management.mjs'

if (process.argv.length !== 3) throw new Error('Usage: node integration/scripts/image-command.mjs <build|push>')
const args = imageCommand(process.argv[2], resolveTestImage(), process.env.PLAYWRIGHT_RUNTIME_IMAGE)
console.log(`docker ${args.join(' ')}`)
const result = spawnSync('docker', args, {
  cwd: fileURLToPath(new URL('../../', import.meta.url)),
  stdio: 'inherit'
})
if (result.error) throw result.error
if (result.signal) throw new Error(`Docker interrupted by ${result.signal}.`)
process.exitCode = result.status ?? 1
