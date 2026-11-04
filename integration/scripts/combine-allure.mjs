import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const allureBin = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'allure-commandline',
  'bin',
  'allure'
)

function readVersions(resultsRoot, runId) {
  const file = join(resultsRoot, runId, 'versions.json')
  if (!existsSync(file)) {
    console.warn(`Missing versions.json for ${runId}; version details are unavailable.`)
    return undefined
  }
  return readFileSync(file, 'utf8')
}

export function mergeAllureResults(resultsRoot, runIds, target) {
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  let resultCount = 0
  for (const [index, runId] of runIds.entries()) {
    const runResults = join(resultsRoot, runId, 'allure-results')
    if (!existsSync(runResults)) {
      console.warn(`Missing Allure results for ${runId}; no executed tests can be included.`)
      continue
    }
    cpSync(runResults, target, { recursive: true })
    const versions = readVersions(resultsRoot, runId)
    const suiteName = `integration-job-${String(index + 1).padStart(4, '0')}`
    const componentVersions = versions
      ? Object.fromEntries(
          Object.entries(JSON.parse(versions).images).map(([name, { requested }]) => [name, requested])
        )
      : undefined
    const versionNotes = componentVersions
      ? `Component versions:\n\`\`\`json\n${JSON.stringify(componentVersions, null, 2)}\n\`\`\``
      : 'Component versions: unavailable (versions.json is missing).'
    const versionAttachment = `${suiteName}-versions.json`
    if (versions) writeFileSync(join(target, versionAttachment), versions)
    for (const file of readdirSync(runResults).filter((name) => name.endsWith('-result.json'))) {
      const path = join(target, file)
      const result = JSON.parse(readFileSync(path, 'utf8'))
      const labels = result.labels || []
      const browser =
        result.parameters?.find(({ name }) => name === 'Project')?.value ||
        labels.find(({ name }) => name === 'parentSuite')?.value
      if (!browser) throw new Error(`Missing Playwright project/browser for ${runId}/${file}.`)
      result.labels = [
        ...labels.filter(({ name }) => !['parentSuite', 'suite', 'subSuite'].includes(name)),
        { name: 'parentSuite', value: suiteName },
        { name: 'suite', value: browser }
      ]
      result.description = [result.description, versionNotes].filter(Boolean).join('\n\n')
      if (result.descriptionHtml) {
        const escaped = versionNotes.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        result.descriptionHtml += `<pre>${escaped}</pre>`
      }
      if (versions) {
        result.attachments = [
          ...(result.attachments || []),
          { name: 'versions.json', source: versionAttachment, type: 'application/json' }
        ]
      }
      // Keep matrix jobs distinct while preserving retries within the same job.
      for (const key of ['historyId', 'testCaseId']) {
        if (result[key]) result[key] = `${runId}:${result[key]}`
      }
      writeFileSync(path, JSON.stringify(result))
      resultCount++
    }
  }
  return resultCount > 0
}

export function generateCombinedReport(resultsRoot, runIds, workDir, reportDir) {
  const merged = join(workDir, 'combined-allure-results')
  if (!mergeAllureResults(resultsRoot, runIds, merged)) return false
  const generated = spawnSync(process.execPath, [allureBin, 'generate', merged, '--clean', '-o', reportDir], {
    stdio: 'inherit'
  })
  if (generated.error || generated.status !== 0) throw new Error('Combined Allure report generation failed.')
  return true
}
