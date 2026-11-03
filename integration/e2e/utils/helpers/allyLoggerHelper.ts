import { AxeResults } from 'axe-core'

export function logViolations(results: AxeResults) {
  const violations = results.violations
  if (violations.length === 0) return

  console.log(`${violations.length} accessibility violation${violations.length === 1 ? '' : 's'} detected`)

  console.table(
    violations.map(({ id, impact, description, nodes }) => ({
      id,
      impact,
      description,
      nodes: nodes.length
    }))
  )
}
