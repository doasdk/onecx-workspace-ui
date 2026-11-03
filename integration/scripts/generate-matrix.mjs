import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { expandMatrix, loadMatrix } from './matrix.mjs'
import { resolveTestImage } from './test-image-management.mjs'

export function generateActionsMatrix(combinations, env) {
  if (combinations.length === 0 || combinations.length > 256) {
    throw new Error(
      'GitHub Actions requires 1 to 256 matrix combinations. Split larger matrices into separate workflow runs.'
    )
  }
  const e2eImage = resolveTestImage(env)
  const keys = [...new Set(combinations.flatMap((selection) => Object.keys(selection)))]
  const varyingKeys = keys.filter((key) => new Set(combinations.map((selection) => selection[key])).size > 1)
  const displayedKeys = varyingKeys.length ? varyingKeys : keys
  const repository = (image) => image.split('@')[0].replace(/:[^:\/]+$/, '')
  const labels = (selection) =>
    displayedKeys
      .filter((key) => selection[key])
      .map((key) => {
        const image = selection[key]
        const repositories = new Set(
          combinations
            .map((item) => item[key])
            .filter(Boolean)
            .map(repository)
        )
        const version =
          repositories.size > 1
            ? image
            : image.includes('@')
              ? image.slice(image.indexOf('@') + 1)
              : image.slice(image.lastIndexOf(':') + 1)
        return `${key}=${version}`
      })
      .join(', ')
  return {
    include: combinations.map((selection, index) => {
      const runId = `integration-${String(index + 1).padStart(4, '0')}`
      return {
        runId,
        name: `${runId} [${labels(selection)}]`.slice(0, 255),
        testImage: e2eImage,
        selectionBase64: Buffer.from(JSON.stringify(selection)).toString('base64')
      }
    })
  }
}

export function generateActionsOutputs(combinations, env) {
  const matrix = generateActionsMatrix(combinations, env)
  const reportIndex = combinations.map((selection, index) => ({
    runId: matrix.include[index].runId,
    selection
  }))
  const outputs = `matrix=${JSON.stringify(matrix)}\nreport_index=${Buffer.from(JSON.stringify(reportIndex)).toString('base64')}\n`
  if (Buffer.byteLength(outputs, 'utf16le') > 1024 * 1024) {
    throw new Error(
      'Generated matrix exceeds the GitHub Actions 1 MB job-output limit. Split it into separate workflow runs.'
    )
  }
  return outputs
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const combinations = expandMatrix(loadMatrix())
  mkdirSync('.generated', { recursive: true })
  writeFileSync('.generated/combinations.json', JSON.stringify(combinations, null, 2))
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, generateActionsOutputs(combinations, process.env))
  }
  console.log(`Generated ${combinations.length} Cartesian version combination(s).`)
}
