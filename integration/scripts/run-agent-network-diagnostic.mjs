import { pathToFileURL } from 'node:url'
import { diagnose } from './agent-network-diagnostic.mjs'

export async function runDiagnostic(
  env,
  loadConfig = () => import('/opt/onecx-agent/config.mjs'),
  report = console.log,
  check = diagnose
) {
  let config
  try {
    const { parseAgentConfig } = await loadConfig()
    config = parseAgentConfig({ AGENT_CONFIG_JSON: env.AGENT_CONFIG_JSON })
  } catch {
    report('CONFIGURATION: failed (missing, invalid, or incompatible runtime validator)')
    return false
  } finally {
    delete env.AGENT_CONFIG_JSON
  }
  return check(config, report)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = Number(!(await runDiagnostic(process.env)))
}
