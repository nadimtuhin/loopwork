import fs from 'fs'
import path from 'path'
import { promptUser, logger } from '../core/utils'
import readline from 'readline'

async function ask(question: string, defaultValue: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  return new Promise(resolve => {
    rl.question(`${question} [${defaultValue}]: `, (answer) => {
      rl.close()
      resolve(answer || defaultValue)
    })
  })
}

export async function init() {
  const backendChoice = await promptUser('Backend type (github/json) [json]: ', 'json')
  const backendType = backendChoice.toLowerCase().startsWith('g') ? 'github' : 'json'

  const aiChoice = await promptUser('AI CLI tool (opencode/claude) [opencode]: ', 'opencode')
  const aiTool = aiChoice.toLowerCase().startsWith('c') ? 'claude' : 'opencode'

  let backendConfig = ''
  let tasksFile = '.specs/tasks/tasks.json'
  let prdDir = '.specs/tasks'

  if (backendType === 'github') {
    const repoName = await ask('Repo name', 'current repo')
    backendConfig = `withGitHubBackend({ repo: ${repoName === 'current repo' ? 'undefined' : `'${repoName}'`} })`
  } else {
    prdDir = await ask('Task directory', '.specs/tasks')
    if (prdDir.endsWith('/')) prdDir = prdDir.slice(0, -1)
    tasksFile = path.join(prdDir, 'tasks.json')
    backendConfig = `withJSONBackend({ tasksFile: '${tasksFile}' })`
  }

  const configContent = `import { defineConfig, compose, withCostTracking } from './src/loopwork-config-types'
import { withJSONBackend, withGitHubBackend } from './src/backend-plugin'

export default compose(
  ${backendConfig},
  withCostTracking({ dailyBudget: 10.00 }),
)(defineConfig({
  cli: '${aiTool}',
  maxIterations: 50,
}))
`

  if (fs.existsSync('loopwork.config.ts')) {
    const overwrite = await promptUser('loopwork.config.ts already exists. Overwrite? (y/N): ', 'n')
    if (overwrite.toLowerCase() !== 'y') {
      logger.info('Initialization aborted.')
      return
    }
  }

  fs.writeFileSync('loopwork.config.ts', configContent)
  logger.success('Created loopwork.config.ts')

  if (backendType === 'json') {
    if (!fs.existsSync(prdDir)) {
      fs.mkdirSync(prdDir, { recursive: true })
    }

    const tasksJson = {
      "tasks": [
        {
          "id": "TASK-001",
          "status": "pending",
          "priority": "high",
          "title": "My First Task",
          "description": "Implement the first feature"
        }
      ]
    }

    fs.writeFileSync(tasksFile, JSON.stringify(tasksJson, null, 2))
    logger.success(`Created ${tasksFile}`)

    const samplePrd = `# TASK-001: My First Task

## Goal
Implement the first feature

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2
`
    const prdFile = path.join(prdDir, 'TASK-001.md')
    fs.writeFileSync(prdFile, samplePrd)
    logger.success(`Created ${prdFile}`)
  }

  logger.info('\nNext steps:')
  logger.info('1. Install dependencies: bun install')
  logger.info('2. Run loopwork: bun run start')
}
