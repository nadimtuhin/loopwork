/**
 * Init Command
 *
 * Initializes a new Loopwork project with interactive setup.
 * Creates configuration, task directory, and project files.
 */

import type {
  ICommand,
  CommandContext,
  CommandResult,
  CommandOptions,
} from '@loopwork-ai/contracts'

export interface InitOptions {
  /** Skip interactive prompts and use defaults */
  nonInteractive?: boolean
  /** Backend type to use (json or github) */
  backendType?: 'json' | 'github'
  /** AI CLI tool to use (claude or opencode) */
  aiTool?: 'claude' | 'opencode'
  /** Project name */
  projectName?: string
  /** Repository name for GitHub backend (owner/repo format) */
  repoName?: string
  /** Task directory path */
  taskDir?: string
  /** Enable cost tracking plugin */
  enableCostTracking?: boolean
  /** Daily budget for cost tracking */
  dailyBudget?: number
  /** Enable Telegram notifications */
  enableTelegram?: boolean
  /** Enable Discord notifications */
  enableDiscord?: boolean
  /** Post-generation hooks to run */
  enableHooks?: ('git-init' | 'git-commit' | 'npm-install' | 'bun-install')[]
}

type InitDeps = {
  ask?: (question: string, defaultValue: string) => Promise<string>
  process?: NodeJS.Process
  readline?: typeof import('readline')
}

class InitValidationError extends Error {
  constructor(message: string, suggestion?: string) {
    super(message)
    this.name = 'InitValidationError'
    if (suggestion) {
      this.message = `${message} ${suggestion}`
    }
  }
}

async function ask(
  question: string,
  defaultValue: string,
  deps: InitDeps = {}
): Promise<string> {
  const runtimeProcess = deps.process ?? process
  const readlineLib = deps.readline ?? require('readline')

  if (runtimeProcess.env.LOOPWORK_NON_INTERACTIVE === 'true' || !runtimeProcess.stdin.isTTY) {
    return defaultValue
  }

  const rl = readlineLib.createInterface({
    input: runtimeProcess.stdin,
    output: runtimeProcess.stdout,
    terminal: true,
  })

  runtimeProcess.stdin.setEncoding('utf8')

  return new Promise<string>((resolve) => {
    rl.question(`${question} [${defaultValue}]: `, (answer: string) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

function resolveAsk(deps: InitDeps) {
  return deps.ask ?? ((question: string, defaultValue: string) => ask(question, defaultValue, deps))
}

export class InitCommand implements ICommand {
  readonly name = 'init'
  readonly description = 'Initialize a new Loopwork project with interactive setup'
  readonly usage = '[options]'
  readonly examples = [
    { command: 'loopwork init', description: 'Interactive project setup wizard' },
    { command: 'LOOPWORK_NON_INTERACTIVE=true loopwork init', description: 'Non-interactive with defaults' },
  ]
  readonly seeAlso = ['loopwork run', 'loopwork start']

  async execute(context: CommandContext, options: CommandOptions): Promise<CommandResult> {
    const opts = options as InitOptions
    const resolvedAsk = resolveAsk({})
    const logger = context.logger

    try {
      const nonInteractive = opts.nonInteractive ?? false

      if (nonInteractive) {
        logger.info('Running in non-interactive mode, using defaults')
      }

      const backendType = opts.backendType ?? (await resolvedAsk('Backend type (github/json)', 'json')).toLowerCase().startsWith('g') ? 'github' : 'json'
      const aiTool = opts.aiTool ?? (await resolvedAsk('AI CLI tool (opencode/claude)', 'opencode')).toLowerCase().startsWith('c') ? 'claude' : 'opencode'

      let backendConfig = ''
      let tasksFile = '.specs/tasks/tasks.json'
      let prdDir = '.specs/tasks'

      if (backendType === 'github') {
        const repoName = opts.repoName ?? await resolvedAsk('Repo name', 'current repo')
        backendConfig = `withGitHubBackend({ repo: ${repoName === 'current repo' ? 'undefined' : `'${repoName}'`} })`
      } else {
        prdDir = opts.taskDir ?? await resolvedAsk('Task directory', '.specs/tasks')
        if (prdDir.endsWith('/')) prdDir = prdDir.slice(0, -1)
        tasksFile = context.path.join(prdDir, 'tasks.json')
        backendConfig = `withJSONBackend({ tasksFile: '${tasksFile}' })`
      }

      const costTrackingAnswer = (await resolvedAsk('Enable cost tracking? (Y/n)', 'y')).toLowerCase()
      const enableCostTracking = opts.enableCostTracking ?? (costTrackingAnswer === 'y' || costTrackingAnswer === '')
      const dailyBudget = opts.dailyBudget ?? (enableCostTracking ? parseFloat(await resolvedAsk('Daily budget in USD', '10.00')) : 10.00)
      const enableTelegram = opts.enableTelegram ?? (await resolvedAsk('Configure Telegram notifications? (y/N)', 'n')).toLowerCase() === 'y'
      const enableDiscord = opts.enableDiscord ?? (await resolvedAsk('Configure Discord webhooks? (y/N)', 'n')).toLowerCase() === 'y'

      const modelPreset = aiTool === 'claude'
        ? "['claude-sonnet', 'gemini-flash']"
        : "['gemini-flash', 'claude-haiku']"

      const pluginConfigs: string[] = []
      if (enableCostTracking) {
        pluginConfigs.push(`withCostTracking({ dailyBudget: ${dailyBudget} })`)
      }
      if (enableTelegram) {
        pluginConfigs.push(`withTelegram({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID })`)
      }
      if (enableDiscord) {
        pluginConfigs.push(`withDiscord({ webhookUrl: process.env.DISCORD_WEBHOOK_URL })`)
      }

      const importStatements = `import { defineSimpleConfig } from 'loopwork'\n`
      const configContent = `${importStatements}
export default defineSimpleConfig({
  models: ${modelPreset},
  backend: '${tasksFile}',
  parallel: 1,
})
`

      if (context.fs.existsSync('loopwork.config.ts')) {
        if (nonInteractive) {
          logger.warn('loopwork.config.ts already exists, skipping creation')
          return { success: true, code: 0, message: 'Configuration already exists', data: { skipped: true } }
        }
        const overwrite = await resolvedAsk('loopwork.config.ts already exists. Overwrite? (y/N)', 'n')
        if (overwrite.toLowerCase() !== 'y') {
          logger.info('Initialization aborted.')
          return { success: true, code: 0, message: 'Initialization aborted by user', data: { aborted: true } }
        }
      }

      context.fs.writeFileSync('loopwork.config.ts', configContent)
      logger.success('Created loopwork.config.ts')

      const stateDir = '.loopwork'
      if (!context.fs.existsSync(stateDir)) {
        context.fs.mkdirSync(stateDir, { recursive: true })
        logger.success('Created .loopwork directory')
      } else {
        logger.info('.loopwork directory already exists')
      }

      if (backendType === 'json') {
        if (!context.fs.existsSync(prdDir)) {
          context.fs.mkdirSync(prdDir, { recursive: true })
        }

        const tasksJson = {
          tasks: [
            {
              id: 'TASK-001',
              status: 'pending',
              priority: 'high',
              title: 'My First Task',
              description: 'Implement the first feature',
            },
          ],
        }

        context.fs.writeFileSync(tasksFile, JSON.stringify(tasksJson, null, 2))
        logger.success(`Created ${tasksFile}`)

        const samplePrd = `# TASK-001: My First Task

## Goal
Implement the first feature

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2
`
        const prdFile = context.path.join(prdDir, 'TASK-001.md')
        context.fs.writeFileSync(prdFile, samplePrd)
        logger.success(`Created ${prdFile}`)

        const templatesDir = context.path.join(prdDir, 'templates')
        if (!context.fs.existsSync(templatesDir)) {
          context.fs.mkdirSync(templatesDir, { recursive: true })
        }

        const featureTemplate = `# TASK-XXX: Feature Name

## Goal
Brief description of what this feature should accomplish

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Notes
Any technical considerations, constraints, or implementation hints
`

        const bugfixTemplate = `# TASK-XXX: Bug Fix Title

## Problem
Description of the bug and how it manifests

## Expected Behavior
What should happen instead

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Root Cause
(To be filled during investigation)

## Solution
- [ ] Fix description
- [ ] Test coverage
- [ ] Regression prevention
`

        context.fs.writeFileSync(context.path.join(templatesDir, 'feature-template.md'), featureTemplate)
        context.fs.writeFileSync(context.path.join(templatesDir, 'bugfix-template.md'), bugfixTemplate)
        logger.success('Created PRD templates')
      }

      const gitignorePath = '.gitignore'
      const requiredPatterns = [
        '.loopwork/',
        'node_modules/',
        '.turbo/',
        '*.log',
        '.env',
        '.env.local',
      ]

      let existingContent = ''
      let existingPatterns = new Set<string>()

      if (context.fs.existsSync(gitignorePath)) {
        existingContent = context.fs.readFileSync(gitignorePath, 'utf-8')
        existingPatterns = new Set(
          existingContent.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
        )
      }

      const missingPatterns = requiredPatterns.filter((pattern) => !existingPatterns.has(pattern))

      if (missingPatterns.length > 0) {
        const shouldUpdate = await resolvedAsk(
          `.gitignore ${context.fs.existsSync(gitignorePath) ? 'exists' : 'does not exist'}. Add loopwork patterns? (Y/n)`,
          'y'
        )

        if (shouldUpdate.toLowerCase() === 'y' || shouldUpdate === '') {
          let newContent = existingContent
          if (existingContent && !existingContent.endsWith('\n')) {
            newContent += '\n'
          }
          if (existingContent) {
            newContent += '\n# Loopwork\n'
          }
          newContent += missingPatterns.join('\n') + '\n'
          context.fs.writeFileSync(gitignorePath, newContent)
          logger.success(`Updated .gitignore with ${missingPatterns.length} new pattern(s)`)
        }
      } else {
        logger.info('.gitignore already contains all recommended patterns')
      }

      const projectName = opts.projectName ?? context.path.basename(context.process.cwd())
      const readmeContent = `# ${projectName}

AI-powered task automation project using Loopwork.

## Quick Start

\`\`\`bash
# Install dependencies
bun install

# Run loopwork
bun run loopwork
# or use npx
npx loopwork

# Resume from last state
bun run loopwork --resume
\`\`\`

## Configuration

Configuration is in \`loopwork.config.ts\`. The project uses:
- AI CLI: **${aiTool}**
- Task backend: See config file for backend type

## Documentation

For more information, see the [Loopwork documentation](https://github.com/your-org/loopwork).

## Task Management

Tasks are managed through the configured backend. Check \`.specs/tasks/\` for PRD files (if using JSON backend).
`

      if (!context.fs.existsSync('README.md')) {
        context.fs.writeFileSync('README.md', readmeContent)
        logger.success('Created README.md')
      } else {
        logger.info('README.md already exists, skipping')
      }

      const nextSteps = [
        'Install loopwork: bun add loopwork',
        'Run loopwork: npx loopwork',
      ]

      if (enableTelegram || enableDiscord) {
        const envVars: string[] = []
        if (enableTelegram) {
          envVars.push('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID')
        }
        if (enableDiscord) {
          envVars.push('DISCORD_WEBHOOK_URL')
        }
        nextSteps.push(`Set environment variables: ${envVars.join(', ')}`)
      }

      logger.raw('')
      logger.raw('===========================================')
      logger.raw('Initialization Complete!')
      logger.raw('===========================================')
      logger.raw('')
      logger.raw('Next steps:')
      nextSteps.forEach((step, i) => {
        logger.raw(`  ${i + 1}. ${step}`)
      })
      logger.raw('')

      return {
        success: true,
        code: 0,
        message: 'Initialization complete',
        data: {
          backendType,
          aiTool,
          tasksFile,
          plugins: pluginConfigs,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Initialization failed: ${message}`)
      return {
        success: false,
        code: 1,
        message: `Initialization failed: ${message}`,
      }
    }
  }

  validate?(options: CommandOptions): string | undefined {
    const opts = options as InitOptions
    if (opts.dailyBudget !== undefined && (isNaN(opts.dailyBudget) || opts.dailyBudget <= 0)) {
      return 'dailyBudget must be a positive number'
    }
    if (opts.backendType !== undefined && !['json', 'github'].includes(opts.backendType)) {
      return 'backendType must be "json" or "github"'
    }
    if (opts.aiTool !== undefined && !['claude', 'opencode'].includes(opts.aiTool)) {
      return 'aiTool must be "claude" or "opencode"'
    }
    return undefined
  }
}

export function createInitCommand(): ICommand {
  return new InitCommand()
}
