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

export async function safeWriteFile(filePath: string, content: string, description: string): Promise<boolean> {
  if (fs.existsSync(filePath)) {
    const overwrite = await promptUser(`${filePath} already exists. Overwrite? (y/N): `, 'n')
    if (overwrite.toLowerCase() !== 'y') {
      logger.info(`Skipped ${description}`)
      return false
    }
  }

  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(filePath, content)
  logger.success(`Created ${description}`)
  return true
}

export async function updateGitignore() {
  const gitignorePath = '.gitignore'
  const requiredPatterns = [
    '.loopwork-state/',
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
    logger.info('.gitignore already contains all recommended patterns')
    return
  }

  const shouldUpdate = await promptUser(
    `.gitignore ${fs.existsSync(gitignorePath) ? 'exists' : 'does not exist'}. Add loopwork patterns? (Y/n): `,
    'y'
  )

  if (shouldUpdate.toLowerCase() !== 'y' && shouldUpdate.toLowerCase() !== '') {
    logger.info('Skipped .gitignore update')
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
  logger.success(`Updated .gitignore with ${missingPatterns.length} new pattern(s)`)
}

export async function createReadme(projectName: string, aiTool: string) {
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

  await safeWriteFile('README.md', readmeContent, 'README.md')
}

export async function createPrdTemplates(templatesDir: string) {
  const shouldCreate = await promptUser('Create PRD template files? (Y/n): ', 'y')

  if (shouldCreate.toLowerCase() !== 'y' && shouldCreate.toLowerCase() !== '') {
    logger.info('Skipped PRD templates')
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
    'feature template'
  )

  await safeWriteFile(
    path.join(templatesDir, 'bugfix-template.md'),
    bugfixTemplate,
    'bugfix template'
  )
}

export async function setupPlugins(): Promise<string[]> {
  const plugins: string[] = []

  logger.info('\nOptional plugin configuration:')

  // Cost tracking (make it optional)
  const wantCostTracking = await promptUser('Enable cost tracking? (Y/n): ', 'y')
  if (wantCostTracking.toLowerCase() === 'y' || wantCostTracking === '') {
    const budget = await ask('Daily budget in USD', '10.00')
    plugins.push(`withCostTracking({ dailyBudget: ${budget} })`)
  }

  // Telegram
  const wantTelegram = await promptUser('Configure Telegram notifications? (y/N): ', 'n')
  if (wantTelegram.toLowerCase() === 'y') {
    logger.info('You will need TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables')
    plugins.push(`withTelegram({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID })`)
  }

  // Discord
  const wantDiscord = await promptUser('Configure Discord webhooks? (y/N): ', 'n')
  if (wantDiscord.toLowerCase() === 'y') {
    logger.info('You will need DISCORD_WEBHOOK_URL environment variable')
    plugins.push(`withDiscord({ webhookUrl: process.env.DISCORD_WEBHOOK_URL })`)
  }

  return plugins
}

export async function init() {
  logger.info('Welcome to Loopwork initialization!\n')

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

  // Setup plugins
  const pluginConfigs = await setupPlugins()

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
    const overwrite = await promptUser('loopwork.config.ts already exists. Overwrite? (y/N): ', 'n')
    if (overwrite.toLowerCase() !== 'y') {
      logger.info('Initialization aborted.')
      return
    }
  }

  fs.writeFileSync('loopwork.config.ts', configContent)
  logger.success('Created loopwork.config.ts')

  // Create .loopwork-state directory upfront
  const stateDir = '.loopwork-state'
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true })
    logger.success('Created .loopwork-state directory')
  } else {
    logger.info('.loopwork-state directory already exists')
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

    // Create PRD templates
    const templatesDir = path.join(prdDir, 'templates')
    await createPrdTemplates(templatesDir)
  }

  // Update .gitignore
  await updateGitignore()

  // Create README
  const projectName = path.basename(process.cwd())
  await createReadme(projectName, aiTool)

  logger.info('\n' + '='.repeat(60))
  logger.success('Loopwork initialization complete!')
  logger.info('='.repeat(60))

  logger.info('\nNext steps:')
  logger.info('1. Install loopwork: bun add loopwork')

  // Generate plugin installation commands
  if (pluginPackages.length > 0) {
    logger.info('2. Install plugin packages:')
    const packageNames = pluginPackages.map(pkg => pkg.package).join(' ')
    logger.info(`   bun add ${packageNames}`)
  }

  // Environment variables notice
  if (pluginConfigs.some(p => p.includes('withTelegram') || p.includes('withDiscord'))) {
    const stepNum = pluginPackages.length > 0 ? '3' : '2'
    logger.info(`${stepNum}. Set environment variables for plugins:`)
    if (pluginConfigs.some(p => p.includes('withTelegram'))) {
      logger.info('   - TELEGRAM_BOT_TOKEN')
      logger.info('   - TELEGRAM_CHAT_ID')
    }
    if (pluginConfigs.some(p => p.includes('withDiscord'))) {
      logger.info('   - DISCORD_WEBHOOK_URL')
    }
    logger.info(`${parseInt(stepNum) + 1}. Run loopwork: npx loopwork`)
  } else {
    const stepNum = pluginPackages.length > 0 ? '3' : '2'
    logger.info(`${stepNum}. Run loopwork: npx loopwork`)
  }

  if (backendType === 'json') {
    logger.info(`\nPRD templates available at: ${path.join(prdDir, 'templates')}`)
  }
}
