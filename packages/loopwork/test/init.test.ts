import { describe, test, expect, beforeEach, afterEach, mock, spyOn, beforeAll } from 'bun:test'
import fs from 'fs'
import path from 'path'

// Mock the utils module BEFORE importing init
const mockLogger = {
  info: mock(() => {}),
  success: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  update: mock(() => {})
}

let mockPromptUser: any
let promptResponses: Map<string, string>

// Create mock module
const createMockUtils = () => {
  mockPromptUser = mock((question: string, defaultValue: string) => {
    for (const [key, value] of promptResponses.entries()) {
      if (question.includes(key)) {
        return Promise.resolve(value)
      }
    }
    return Promise.resolve(defaultValue)
  })

  return {
    promptUser: mockPromptUser,
    logger: mockLogger,
    getTimestamp: () => '00:00:00',
    StreamLogger: class {}
  }
}

// Import the functions we're testing
import { safeWriteFile, updateGitignore, createReadme, createPrdTemplates, setupPlugins, init } from '../src/commands/init'

describe('Init Command', () => {
  const testDir = path.join('/tmp', 'loopwork-init-test-' + Date.now())

  beforeAll(async () => {
    // Setup mock for utils module
    const utils = await import('../src/core/utils')
    promptResponses = new Map()

    mockPromptUser = mock((question: string, defaultValue: string) => {
      for (const [key, value] of promptResponses.entries()) {
        if (question.includes(key)) {
          return Promise.resolve(value)
        }
      }
      return Promise.resolve(defaultValue)
    })

    spyOn(utils, 'promptUser').mockImplementation(mockPromptUser)
    spyOn(utils as any, 'logger', 'get').mockReturnValue(mockLogger)
  })

  beforeEach(() => {
    // Create a clean test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
    process.chdir(testDir)

    // Reset mock responses
    promptResponses.clear()
  })

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('safeWriteFile', () => {
    test('creates a new file when it does not exist', async () => {
      const filePath = path.join(testDir, 'test.txt')
      const content = 'Hello World'

      const result = await safeWriteFile(filePath, content, 'test file')

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
    })

    test('overwrites file when user says yes', async () => {
      const filePath = path.join(testDir, 'existing.txt')
      fs.writeFileSync(filePath, 'Old content')

      promptResponses.set('already exists', 'y')

      const result = await safeWriteFile(filePath, 'New content', 'existing file')

      expect(result).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('New content')
    })

    test('skips file when user says no', async () => {
      const filePath = path.join(testDir, 'existing.txt')
      const originalContent = 'Original content'
      fs.writeFileSync(filePath, originalContent)

      promptResponses.set('already exists', 'n')

      const result = await safeWriteFile(filePath, 'New content', 'existing file')

      expect(result).toBe(false)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(originalContent)
    })

    test('creates directory when parent does not exist', async () => {
      const filePath = path.join(testDir, 'nested', 'dir', 'test.txt')
      const content = 'Nested file'

      const result = await safeWriteFile(filePath, content, 'nested file')

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.existsSync(path.dirname(filePath))).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
    })
  })

  describe('updateGitignore', () => {
    test('creates .gitignore when it does not exist', async () => {
      promptResponses.set('Add loopwork patterns', 'y')

      await updateGitignore()

      expect(fs.existsSync('.gitignore')).toBe(true)
      const content = fs.readFileSync('.gitignore', 'utf-8')
      expect(content).toContain('.loopwork-state/')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.env')
    })

    test('adds patterns when .gitignore exists with no loopwork patterns', async () => {
      fs.writeFileSync('.gitignore', 'dist/\n*.swp\n')
      promptResponses.set('Add loopwork patterns', 'y')

      await updateGitignore()

      const content = fs.readFileSync('.gitignore', 'utf-8')
      expect(content).toContain('dist/')
      expect(content).toContain('*.swp')
      expect(content).toContain('.loopwork-state/')
      expect(content).toContain('# Loopwork')
    })

    test('skips when .gitignore already has all patterns', async () => {
      const existingContent = `.loopwork-state/
node_modules/
.turbo/
*.log
.env
.env.local
`
      fs.writeFileSync('.gitignore', existingContent)

      await updateGitignore()

      const content = fs.readFileSync('.gitignore', 'utf-8')
      expect(content).toBe(existingContent)
    })

    test('adds only missing patterns when partial update needed', async () => {
      fs.writeFileSync('.gitignore', '.loopwork-state/\nnode_modules/\n')
      promptResponses.set('Add loopwork patterns', 'y')

      await updateGitignore()

      const content = fs.readFileSync('.gitignore', 'utf-8')
      expect(content).toContain('.loopwork-state/')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.turbo/')
      expect(content).toContain('*.log')
      expect(content).toContain('.env')
      expect(content).toContain('.env.local')
    })

    test('skips update when user declines', async () => {
      const existingContent = 'dist/\n'
      fs.writeFileSync('.gitignore', existingContent)
      promptResponses.set('Add loopwork patterns', 'n')

      await updateGitignore()

      const content = fs.readFileSync('.gitignore', 'utf-8')
      expect(content).toBe(existingContent)
    })
  })

  describe('createReadme', () => {
    test('creates README with project name and AI tool', async () => {
      await createReadme('my-awesome-project', 'opencode')

      expect(fs.existsSync('README.md')).toBe(true)
      const content = fs.readFileSync('README.md', 'utf-8')
      expect(content).toContain('# my-awesome-project')
      expect(content).toContain('AI CLI: **opencode**')
      expect(content).toContain('## Quick Start')
      expect(content).toContain('bun run loopwork')
    })

    test('creates README with claude as AI tool', async () => {
      await createReadme('test-project', 'claude')

      const content = fs.readFileSync('README.md', 'utf-8')
      expect(content).toContain('AI CLI: **claude**')
    })

    test('skips when README exists and user says no', async () => {
      const existingContent = '# Existing README\n\nDo not overwrite'
      fs.writeFileSync('README.md', existingContent)
      promptResponses.set('already exists', 'n')

      await createReadme('new-project', 'opencode')

      const content = fs.readFileSync('README.md', 'utf-8')
      expect(content).toBe(existingContent)
    })

    test('overwrites when README exists and user says yes', async () => {
      fs.writeFileSync('README.md', '# Old README')
      promptResponses.set('already exists', 'y')

      await createReadme('new-project', 'opencode')

      const content = fs.readFileSync('README.md', 'utf-8')
      expect(content).toContain('# new-project')
      expect(content).not.toContain('# Old README')
    })
  })

  describe('createPrdTemplates', () => {
    test('creates templates when user says yes', async () => {
      const templatesDir = path.join(testDir, 'templates')
      promptResponses.set('Create PRD template', 'y')

      await createPrdTemplates(templatesDir)

      expect(fs.existsSync(templatesDir)).toBe(true)
      expect(fs.existsSync(path.join(templatesDir, 'feature-template.md'))).toBe(true)
      expect(fs.existsSync(path.join(templatesDir, 'bugfix-template.md'))).toBe(true)

      const featureContent = fs.readFileSync(path.join(templatesDir, 'feature-template.md'), 'utf-8')
      expect(featureContent).toContain('## Goal')
      expect(featureContent).toContain('## Requirements')

      const bugfixContent = fs.readFileSync(path.join(templatesDir, 'bugfix-template.md'), 'utf-8')
      expect(bugfixContent).toContain('## Problem')
      expect(bugfixContent).toContain('## Solution')
    })

    test('skips templates when user says no', async () => {
      const templatesDir = path.join(testDir, 'templates')
      promptResponses.set('Create PRD template', 'n')

      await createPrdTemplates(templatesDir)

      expect(fs.existsSync(path.join(templatesDir, 'feature-template.md'))).toBe(false)
      expect(fs.existsSync(path.join(templatesDir, 'bugfix-template.md'))).toBe(false)
    })

    test('creates directory if it does not exist', async () => {
      const templatesDir = path.join(testDir, 'deep', 'nested', 'templates')
      promptResponses.set('Create PRD template', 'y')

      await createPrdTemplates(templatesDir)

      expect(fs.existsSync(templatesDir)).toBe(true)
    })
  })

  describe('setupPlugins', () => {
    test('enables cost tracking when user says yes', async () => {
      promptResponses.set('Enable cost tracking', 'y')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      // Mock the ask function for budget input
      const readline = await import('readline')
      const originalCreateInterface = readline.createInterface
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          cb('15.00')
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      const plugins = await setupPlugins()

      expect(plugins).toContain('withCostTracking({ dailyBudget: 15.00 })')
      expect(plugins.length).toBe(1)
    })

    test('enables telegram when user says yes', async () => {
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'y')
      promptResponses.set('Configure Discord', 'n')

      const plugins = await setupPlugins()

      expect(plugins.some(p => p.includes('withTelegram'))).toBe(true)
    })

    test('enables discord when user says yes', async () => {
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'y')

      const plugins = await setupPlugins()

      expect(plugins.some(p => p.includes('withDiscord'))).toBe(true)
    })

    test('enables multiple plugins together', async () => {
      promptResponses.set('Enable cost tracking', 'y')
      promptResponses.set('Configure Telegram', 'y')
      promptResponses.set('Configure Discord', 'y')

      const readline = await import('readline')
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          cb('20.00')
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      const plugins = await setupPlugins()

      expect(plugins.length).toBe(3)
      expect(plugins.some(p => p.includes('withCostTracking'))).toBe(true)
      expect(plugins.some(p => p.includes('withTelegram'))).toBe(true)
      expect(plugins.some(p => p.includes('withDiscord'))).toBe(true)
    })

    test('returns empty array when no plugins selected', async () => {
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      const plugins = await setupPlugins()

      expect(plugins).toEqual([])
    })
  })

  describe('init - Full Integration', () => {
    test('initializes JSON backend with default settings', async () => {
      promptResponses.set('Backend type', 'json')
      promptResponses.set('AI CLI tool', 'opencode')
      promptResponses.set('Create PRD template', 'n')
      promptResponses.set('Add loopwork patterns', 'y')
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      const readline = await import('readline')
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          cb('.specs/tasks') // default task directory
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      await init()

      // Verify config file
      expect(fs.existsSync('loopwork.config.ts')).toBe(true)
      const configContent = fs.readFileSync('loopwork.config.ts', 'utf-8')
      expect(configContent).toContain('withJSONBackend')
      expect(configContent).toContain("cli: 'opencode'")

      // Verify state directory
      expect(fs.existsSync('.loopwork-state')).toBe(true)

      // Verify tasks structure
      expect(fs.existsSync('.specs/tasks/tasks.json')).toBe(true)
      expect(fs.existsSync('.specs/tasks/TASK-001.md')).toBe(true)

      // Verify tasks.json content
      const tasksJson = JSON.parse(fs.readFileSync('.specs/tasks/tasks.json', 'utf-8'))
      expect(tasksJson.tasks).toBeDefined()
      expect(tasksJson.tasks[0].id).toBe('TASK-001')

      // Verify gitignore
      expect(fs.existsSync('.gitignore')).toBe(true)

      // Verify README
      expect(fs.existsSync('README.md')).toBe(true)
    })

    test('initializes GitHub backend', async () => {
      promptResponses.set('Backend type', 'github')
      promptResponses.set('AI CLI tool', 'claude')
      promptResponses.set('Add loopwork patterns', 'y')
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      const readline = await import('readline')
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          if (q.includes('Repo name')) {
            cb('current repo')
          }
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      await init()

      const configContent = fs.readFileSync('loopwork.config.ts', 'utf-8')
      expect(configContent).toContain('withGitHubBackend')
      expect(configContent).toContain("cli: 'claude'")
      expect(configContent).toContain('repo: undefined')
    })

    test('includes plugins in config when selected', async () => {
      promptResponses.set('Backend type', 'json')
      promptResponses.set('AI CLI tool', 'opencode')
      promptResponses.set('Create PRD template', 'n')
      promptResponses.set('Add loopwork patterns', 'y')
      promptResponses.set('Enable cost tracking', 'y')
      promptResponses.set('Configure Telegram', 'y')
      promptResponses.set('Configure Discord', 'n')

      const readline = await import('readline')
      let callCount = 0
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          if (q.includes('Daily budget')) {
            cb('25.00')
          } else {
            cb('.specs/tasks')
          }
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      await init()

      const configContent = fs.readFileSync('loopwork.config.ts', 'utf-8')
      expect(configContent).toContain("from '@loopwork-ai/cost-tracking'")
      expect(configContent).toContain("from '@loopwork-ai/telegram'")
      expect(configContent).toContain('withCostTracking')
      expect(configContent).toContain('withTelegram')
    })

    test('aborts when config already exists and user says no', async () => {
      fs.writeFileSync('loopwork.config.ts', '// Existing config')
      promptResponses.set('Backend type', 'json')
      promptResponses.set('AI CLI tool', 'opencode')
      promptResponses.set('already exists', 'n')
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      const readline = await import('readline')
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          cb('.specs/tasks')
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      await init()

      const configContent = fs.readFileSync('loopwork.config.ts', 'utf-8')
      expect(configContent).toBe('// Existing config')
    })

    test('creates custom task directory when specified', async () => {
      promptResponses.set('Backend type', 'json')
      promptResponses.set('AI CLI tool', 'opencode')
      promptResponses.set('Create PRD template', 'n')
      promptResponses.set('Add loopwork patterns', 'y')
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      const readline = await import('readline')
      spyOn(readline, 'createInterface').mockReturnValue({
        question: (q: string, cb: (answer: string) => void) => {
          cb('custom/tasks/dir')
          return { close: () => {} }
        },
        close: () => {}
      } as any)

      await init()

      expect(fs.existsSync('custom/tasks/dir')).toBe(true)
      expect(fs.existsSync('custom/tasks/dir/tasks.json')).toBe(true)
      expect(fs.existsSync('custom/tasks/dir/TASK-001.md')).toBe(true)

      const configContent = fs.readFileSync('loopwork.config.ts', 'utf-8')
      expect(configContent).toContain('custom/tasks/dir/tasks.json')
    })
  })

  test('README template contains required sections', () => {
    const readmeContent = `# test-project

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
- AI CLI: **opencode**
- Task backend: See config file for backend type

## Documentation

For more information, see the [Loopwork documentation](https://github.com/your-org/loopwork).

## Task Management

Tasks are managed through the configured backend. Check \`.specs/tasks/\` for PRD files (if using JSON backend).
`

    // Verify README has required sections
    expect(readmeContent).toContain('# test-project')
    expect(readmeContent).toContain('## Quick Start')
    expect(readmeContent).toContain('## Configuration')
    expect(readmeContent).toContain('## Documentation')
    expect(readmeContent).toContain('bun run loopwork')
    expect(readmeContent).toContain('--resume')
  })

  test('PRD templates have correct structure', () => {
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

    // Verify template structure
    expect(featureTemplate).toContain('## Goal')
    expect(featureTemplate).toContain('## Requirements')
    expect(featureTemplate).toContain('## Acceptance Criteria')
    expect(featureTemplate).toContain('## Technical Notes')

    expect(bugfixTemplate).toContain('## Problem')
    expect(bugfixTemplate).toContain('## Expected Behavior')
    expect(bugfixTemplate).toContain('## Steps to Reproduce')
    expect(bugfixTemplate).toContain('## Root Cause')
    expect(bugfixTemplate).toContain('## Solution')
  })

  test('config file uses correct package imports', () => {
    // Correct imports for installed package
    const correctConfig = `import { defineConfig, compose } from 'loopwork'
import { withJSONBackend } from 'loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
)(defineConfig({
  cli: 'opencode',
  maxIterations: 50,
}))
`

    // With plugins - should use correct package names
    const configWithPlugins = `import { defineConfig, compose } from 'loopwork'
import { withJSONBackend } from 'loopwork'

// Plugin imports
import { withCostTracking } from '@loopwork-ai/cost-tracking'
import { withTelegram } from '@loopwork-ai/telegram'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withCostTracking({ dailyBudget: 10.00 }),
  withTelegram({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID }),
)(defineConfig({
  cli: 'opencode',
  maxIterations: 50,
}))
`

    // Verify correct imports
    expect(correctConfig).toContain("from 'loopwork'")
    expect(correctConfig).not.toContain("from './src")
    expect(configWithPlugins).toContain("from '@loopwork-ai/cost-tracking'")
    expect(configWithPlugins).toContain("from '@loopwork-ai/telegram'")
  })

  test('generated config can be imported from loopwork package', async () => {
    // Write a test config file
    const configContent = `import { defineConfig, compose, withJSONBackend } from 'loopwork'

export default compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
)(defineConfig({
  cli: 'opencode',
  maxIterations: 50,
}))
`

    const configPath = path.join(testDir, 'loopwork.config.ts')
    fs.writeFileSync(configPath, configContent)

    // Try to import it - this will fail if the exports are incorrect
    try {
      // We need to use the actual loopwork package path since we're in the monorepo
      const loopworkPath = path.resolve(__dirname, '../src/index.ts')

      // Verify the exports exist
      const loopworkModule = await import(loopworkPath)

      expect(loopworkModule.defineConfig).toBeDefined()
      expect(loopworkModule.compose).toBeDefined()
      expect(loopworkModule.withJSONBackend).toBeDefined()
      expect(loopworkModule.withGitHubBackend).toBeDefined()
      expect(loopworkModule.withPlugin).toBeDefined()

      // Test that they actually work
      const config = loopworkModule.defineConfig({ cli: 'opencode', maxIterations: 10 })
      expect(config.cli).toBe('opencode')
      expect(config.maxIterations).toBe(10)

      const wrapped = loopworkModule.compose(
        loopworkModule.withJSONBackend({ tasksFile: 'test.json' })
      )(config)

      expect(wrapped.backend).toBeDefined()
      expect(wrapped.backend.type).toBe('json')
    } catch (error) {
      throw new Error(`Failed to import loopwork exports: ${error}`)
    }
  })
})
