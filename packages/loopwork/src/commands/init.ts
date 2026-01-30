import fs from 'fs'
import path from 'path'
import { logger, Banner, separator, CompletionSummary } from '../core/utils'
import readline from 'readline'
import packageJson from '../../package.json'

type InitDeps = {
  ask?: (question: string, defaultValue: string) => Promise<string>
  logger?: typeof logger
  process?: NodeJS.Process
  readline?: typeof readline
}

async function ask(question: string, defaultValue: string, deps: InitDeps = {}): Promise<string> {
  const runtimeProcess = deps.process ?? process
  const activeLogger = deps.logger ?? logger
  const readlineLib = deps.readline ?? readline
  // Check if running in non-interactive mode
  if (runtimeProcess.env.LOOPWORK_NON_INTERACTIVE === 'true' || !runtimeProcess.stdin.isTTY) {
    activeLogger.debug(`Non-interactive mode, using default: ${defaultValue}`)
    return defaultValue
  }

  const rl = readlineLib.createInterface({
    input: runtimeProcess.stdin,
    output: runtimeProcess.stdout,
    terminal: true
  })

  // Ensure stdin is in the right mode
  runtimeProcess.stdin.setEncoding('utf8')

  return new Promise((resolve) => {
    rl.question(`${question} [${defaultValue}]: `, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

function resolveAsk(deps: InitDeps) {
  return deps.ask ?? ((question: string, defaultValue: string) => ask(question, defaultValue, deps))
}

export async function safeWriteFile(
  filePath: string,
  content: string,
  description: string,
  deps: InitDeps = {}
): Promise<boolean> {
  const activeLogger = deps.logger ?? logger
  const askFn = resolveAsk(deps)
  if (fs.existsSync(filePath)) {
    const overwrite = await askFn(`${filePath} already exists. Overwrite? (y/N)`, 'n')
    if (overwrite.toLowerCase() !== 'y') {
      activeLogger.info(`Skipped ${description}`)
      return false
    }
  }

  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(filePath, content)
  activeLogger.success(`Created ${description}`)
  return true
}

export async function updateGitignore(deps: InitDeps = {}) {
  const activeLogger = deps.logger ?? logger
  const askFn = resolveAsk(deps)
  const gitignorePath = '.gitignore'
  const requiredPatterns = [
    '.loopwork/',
    'node_modules/',
    '.turbo/',
    '*.log',
    '.env',
    '.env.local'
  ]

  let existingContent = ''
  let existingPatterns = new Set<string>()

  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, 'utf-8')
    existingPatterns = new Set(
      existingContent.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'))
    )
  }

  const missingPatterns = requiredPatterns.filter(pattern => !existingPatterns.has(pattern))

  if (missingPatterns.length === 0) {
    activeLogger.info('.gitignore already contains all recommended patterns')
    return
  }

  const shouldUpdate = await askFn(
    `.gitignore ${fs.existsSync(gitignorePath) ? 'exists' : 'does not exist'}. Add loopwork patterns? (Y/n)`,
    'y'
  )

  if (shouldUpdate.toLowerCase() !== 'y' && shouldUpdate.toLowerCase() !== '') {
    activeLogger.info('Skipped .gitignore update')
    return
  }

  let newContent = existingContent
  if (existingContent && !existingContent.endsWith('\n')) {
    newContent += '\n'
  }

  if (existingContent) {
    newContent += '\n# Loopwork\n'
  }

  newContent += missingPatterns.join('\n') + '\n'

  fs.writeFileSync(gitignorePath, newContent)
  activeLogger.success(`Updated .gitignore with ${missingPatterns.length} new pattern(s)`)
}

export async function createReadme(projectName: string, aiTool: string, deps: InitDeps = {}) {
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

  await safeWriteFile('README.md', readmeContent, 'README.md', deps)
}

export async function createPrdTemplates(templatesDir: string, deps: InitDeps = {}) {
  const activeLogger = deps.logger ?? logger
  const askFn = resolveAsk(deps)
  const shouldCreate = await askFn('Create PRD template files? (Y/n)', 'y')

  if (shouldCreate.toLowerCase() !== 'y' && shouldCreate.toLowerCase() !== '') {
    activeLogger.info('Skipped PRD templates')
    return
  }

  if (!fs.existsSync(templatesDir)) {
    fs.mkdirSync(templatesDir, { recursive: true })
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

  await safeWriteFile(
    path.join(templatesDir, 'feature-template.md'),
    featureTemplate,
    'feature template',
    deps
  )

  await safeWriteFile(
    path.join(templatesDir, 'bugfix-template.md'),
    bugfixTemplate,
    'bugfix template',
    deps
  )
}

export async function setupPlugins(deps: InitDeps = {}): Promise<string[]> {
  const activeLogger = deps.logger ?? logger
  const askFn = resolveAsk(deps)
  const plugins: string[] = []

  activeLogger.info('\nOptional plugin configuration:')

  // Cost tracking (make it optional)
  const wantCostTracking = await askFn('Enable cost tracking? (Y/n)', 'y')
  if (wantCostTracking.toLowerCase() === 'y' || wantCostTracking === '') {
    const budget = await askFn('Daily budget in USD', '10.00')
    plugins.push(`withCostTracking({ dailyBudget: ${budget} })`)
  }

  // Telegram
  const wantTelegram = await askFn('Configure Telegram notifications? (y/N)', 'n')
  if (wantTelegram.toLowerCase() === 'y') {
    activeLogger.info('You will need TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables')
    plugins.push(`withTelegram({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID })`)
  }

  // Discord
  const wantDiscord = await askFn('Configure Discord webhooks? (y/N)', 'n')
  if (wantDiscord.toLowerCase() === 'y') {
    activeLogger.info('You will need DISCORD_WEBHOOK_URL environment variable')
    plugins.push(`withDiscord({ webhookUrl: process.env.DISCORD_WEBHOOK_URL })`)
  }

  return plugins
}

/**
 * Initialize a new Loopwork project
 *
 * Interactive setup wizard that creates:
 * - loopwork.config.ts (main configuration)
 * - .specs/tasks/ (task directory with templates)
 * - .loopwork/ (state directory for resume)
 * - .gitignore (with loopwork patterns)
 * - README.md (project documentation)
 *
 * Safe to run multiple times - prompts before overwriting.
 */
export async function init(deps: InitDeps = {}) {
  const runtimeProcess = deps.process ?? process
  const activeLogger = deps.logger ?? logger
  const askFn = resolveAsk(deps)
  activeLogger.info(`Welcome to Loopwork v${packageJson.version} initialization!\n`)

  // Support non-interactive mode via environment variables
  const nonInteractive = runtimeProcess.env.LOOPWORK_NON_INTERACTIVE === 'true' || !runtimeProcess.stdin.isTTY

  if (nonInteractive) {
    activeLogger.info('Running in non-interactive mode, using defaults')
    activeLogger.info('Set LOOPWORK_NON_INTERACTIVE=false to enable interactive prompts\n')
  }

  const backendChoice = await askFn('Backend type (github/json)', 'json')
  const backendType = backendChoice.toLowerCase().startsWith('g') ? 'github' : 'json'

  const aiChoice = await askFn('AI CLI tool (opencode/claude)', 'opencode')
  const aiTool = aiChoice.toLowerCase().startsWith('c') ? 'claude' : 'opencode'

  let backendConfig = ''
  let tasksFile = '.specs/tasks/tasks.json'
  let prdDir = '.specs/tasks'

  if (backendType === 'github') {
    const repoName = await askFn('Repo name', 'current repo')
    backendConfig = `withGitHubBackend({ repo: ${repoName === 'current repo' ? 'undefined' : `'${repoName}'`} })`
  } else {
    prdDir = await askFn('Task directory', '.specs/tasks')
    if (prdDir.endsWith('/')) prdDir = prdDir.slice(0, -1)
    tasksFile = path.join(prdDir, 'tasks.json')
    backendConfig = `withJSONBackend({ tasksFile: '${tasksFile}' })`
  }

  // Setup plugins
  const pluginConfigs = await setupPlugins(deps)

  // Build imports based on selected plugins
  const coreImports: string[] = ['defineConfig', 'compose']
  const backendImports: string[] = []
  const pluginPackages: { name: string; package: string; imports: string[] }[] = []

  if (backendType === 'github') {
    backendImports.push('withGitHubBackend')
  } else {
    backendImports.push('withJSONBackend')
  }

  if (pluginConfigs.some(p => p.includes('withCostTracking'))) {
    pluginPackages.push({
      name: 'cost-tracking',
      package: '@loopwork-ai/cost-tracking',
      imports: ['withCostTracking']
    })
  }
  if (pluginConfigs.some(p => p.includes('withTelegram'))) {
    pluginPackages.push({
      name: 'telegram',
      package: '@loopwork-ai/telegram',
      imports: ['withTelegram']
    })
  }
  if (pluginConfigs.some(p => p.includes('withDiscord'))) {
    pluginPackages.push({
      name: 'discord',
      package: '@loopwork-ai/discord',
      imports: ['withDiscord']
    })
  }

  // Generate import statements
  let importStatements = `import { ${coreImports.join(', ')} } from 'loopwork'\n`
  importStatements += `import { ${backendImports.join(', ')} } from 'loopwork'\n`

  if (pluginPackages.length > 0) {
    importStatements += '\n// Plugin imports\n'
    for (const pkg of pluginPackages) {
      importStatements += `import { ${pkg.imports.join(', ')} } from '${pkg.package}'\n`
    }
  }

  const configContent = `${importStatements}
export default compose(
  ${backendConfig},
${pluginConfigs.map(p => `  ${p},`).join('\n')}
)(defineConfig({
  cli: '${aiTool}',
  maxIterations: 50,
}))
`

  if (fs.existsSync('loopwork.config.ts')) {
    const overwrite = await askFn('loopwork.config.ts already exists. Overwrite? (y/N)', 'n')
    if (overwrite.toLowerCase() !== 'y') {
      activeLogger.info('Initialization aborted.')
      return
    }
  }

  activeLogger.startSpinner('Generating configuration...')
  fs.writeFileSync('loopwork.config.ts', configContent)
  activeLogger.stopSpinner('Created loopwork.config.ts')

  // Create .loopwork directory upfront
  const stateDir = '.loopwork'
  if (!fs.existsSync(stateDir)) {
    activeLogger.startSpinner('Creating state directory...')
    fs.mkdirSync(stateDir, { recursive: true })
    activeLogger.stopSpinner('Created .loopwork directory')
  } else {
    activeLogger.info('.loopwork directory already exists')
  }

  if (backendType === 'json') {
    if (!fs.existsSync(prdDir)) {
      fs.mkdirSync(prdDir, { recursive: true })
    }

    activeLogger.startSpinner('Creating initial tasks...')
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
    
    const samplePrd = `# TASK-001: My First Task

## Goal
Implement the first feature

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2
`
    const prdFile = path.join(prdDir, 'TASK-001.md')
    fs.writeFileSync(prdFile, samplePrd)
    activeLogger.stopSpinner('Initial tasks created')

    // Create PRD templates
    const templatesDir = path.join(prdDir, 'templates')
    await createPrdTemplates(templatesDir, deps)
  }


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
    activeLogger.success(`Created ${tasksFile}`)

    const samplePrd = `# TASK-001: My First Task

## Goal
Implement the first feature

## Requirements
- [ ] Requirement 1
- [ ] Requirement 2
`
    const prdFile = path.join(prdDir, 'TASK-001.md')
    fs.writeFileSync(prdFile, samplePrd)
    activeLogger.success(`Created ${prdFile}`)

    // Create PRD templates
    const templatesDir = path.join(prdDir, 'templates')
    await createPrdTemplates(templatesDir, deps)
  }

  // Update .gitignore
  await updateGitignore(deps)

  // Create README
  const projectName = path.basename(runtimeProcess.cwd())
  await createReadme(projectName, aiTool, deps)

  // Build next steps
  const nextSteps: string[] = [
    'Install loopwork: bun add loopwork'
  ]

  if (pluginPackages.length > 0) {
    const packageNames = pluginPackages.map(pkg => pkg.package).join(' ')
    nextSteps.push(`Install plugins: bun add ${packageNames}`)
  }

  if (pluginConfigs.some(p => p.includes('withTelegram') || p.includes('withDiscord'))) {
    let envVars = 'Set environment variables: '
    const vars: string[] = []
    if (pluginConfigs.some(p => p.includes('withTelegram'))) {
      vars.push('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID')
    }
    if (pluginConfigs.some(p => p.includes('withDiscord'))) {
      vars.push('DISCORD_WEBHOOK_URL')
    }
    nextSteps.push(envVars + vars.join(', '))
  }

  nextSteps.push('Run loopwork: npx loopwork')

  if (backendType === 'json') {
    nextSteps.push(`View PRD templates: ${path.join(prdDir, 'templates')}`)
  }

  const summary = new CompletionSummary('Initialization Complete')
  summary.addNextSteps(nextSteps)

  activeLogger.raw('')
  activeLogger.raw(summary.render())
  activeLogger.raw('')
}

/**
 * Create the init command configuration for CLI registration
 */
export function createInitCommand() {
  return {
    name: 'init',
    description: 'Initialize a new Loopwork project with interactive setup',
    usage: '[options]',
    examples: [
      { command: 'loopwork init', description: 'Interactive project setup wizard' },
      { command: 'LOOPWORK_NON_INTERACTIVE=true loopwork init', description: 'Non-interactive with defaults' },
    ],
    seeAlso: [
      'loopwork run      Execute the task loop',
      'loopwork start    Start with daemon mode',
    ],
    handler: init,
  }
}
