const { join } = require('node:path')

function harness() {
  return require(join(process.env.ONECX_AGENT_RUNTIME_DIR || '/opt/onecx-agent', 'playwright.cjs'))
}

exports.createLiveBrowser = (options) => harness().createLiveBrowser(options)
exports.runBrowserAgent = (options) => harness().runBrowserAgent(options)
exports.initializeAgentReport = (options) => harness().initializeAgentReport(options)
exports.recordAssessment = (...args) => harness().recordAssessment(...args)
exports.reporterPath = () => join(process.env.ONECX_AGENT_RUNTIME_DIR || '/opt/onecx-agent', 'allure-reporter.cjs')
exports.createAgentFixtures = (options) => harness().createAgentFixtures(options)
