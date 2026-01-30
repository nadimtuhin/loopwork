import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'
import fs from 'fs'
import path from 'path'

// Track mock responses BEFORE any imports
let promptResponses = new Map<string, string>()
let readlineAnswer = ''

// Now it's safe to import utils (we'll spy on it after)
import * as utils from '../src/core/utils'

// Import the module under test AFTER mocks are set up
import { safeWriteFile, updateGitignore, createReadme, createPrdTemplates, setupPlugins, init } from '../src/commands/init'

describe('Init Command', () => {
  const testDir = path.join('/tmp', 'loopwork-init-test-' + Date.now())
  const resolvePath = (...segments: string[]) => path.join(testDir, ...segments)
  let originalCwd: string
  let originalEnv: Record<string, string | undefined>
  let originalIsTTY: boolean | undefined
  let deps: { ask: (question: string, defaultValue: string) => Promise<string> }

  beforeEach(() => {
    originalCwd = process.cwd()
    originalEnv = { ...process.env }
    originalIsTTY = process.stdin.isTTY
    // Create a clean test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
    process.chdir(testDir)

    // Reset mock responses
    promptResponses.clear()
    readlineAnswer = ''

    // Mock stdin.isTTY to simulate interactive terminal
    Object.defineProperty(process.stdin, 'isTTY', {
      value: true,
      writable: true,
      configurable: true
    })
    delete process.env.LOOPWORK_NON_INTERACTIVE
    deps = {
      ask: async (q: string, defaultValue: string) => {
        let answer = ''
        for (const [key, value] of promptResponses.entries()) {
          if (q.includes(key)) {
            answer = value
            break
          }
        }
        if (!answer) {
          answer = readlineAnswer
        }
        return answer || defaultValue
      }
    }

    // Setup mocks for each test
    spyOn(utils, 'promptUser').mockImplementation(async (question: string, defaultValue: string) => {
      for (const [key, value] of promptResponses.entries()) {
        if (question.includes(key)) {
          return value
        }
      }
      return defaultValue
    })

    spyOn(utils.logger, 'info').mockImplementation(() => {})
    spyOn(utils.logger, 'success').mockImplementation(() => {})
    spyOn(utils.logger, 'warn').mockImplementation(() => {})
    spyOn(utils.logger, 'error').mockImplementation(() => {})
    spyOn(utils.logger, 'debug').mockImplementation(() => {})
    spyOn(utils.logger, 'update').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true
      })
      process.chdir(originalCwd)
    } finally {
      // Cleanup
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  describe('safeWriteFile', () => {
    test('creates a new file when it does not exist', async () => {
      const filePath = path.join(testDir, 'test.txt')
      const content = 'Hello World'

      const result = await safeWriteFile(filePath, content, 'test file', deps)

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
    })

    test('overwrites file when user says yes', async () => {
      const filePath = path.join(testDir, 'existing.txt')
      fs.writeFileSync(filePath, 'Old content')

      promptResponses.set('already exists', 'y')

      const result = await safeWriteFile(filePath, 'New content', 'existing file', deps)

      expect(result).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('New content')
    })

    test('skips file when user says no', async () => {
      const filePath = path.join(testDir, 'existing.txt')
      const originalContent = 'Original content'
      fs.writeFileSync(filePath, originalContent)

      promptResponses.set('already exists', 'n')

      const result = await safeWriteFile(filePath, 'New content', 'existing file', deps)

      expect(result).toBe(false)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(originalContent)
    })

    test('creates directory when parent does not exist', async () => {
      const filePath = path.join(testDir, 'nested', 'dir', 'test.txt')
      const content = 'Nested file'

      const result = await safeWriteFile(filePath, content, 'nested file', deps)

      expect(result).toBe(true)
      expect(fs.existsSync(filePath)).toBe(true)
      expect(fs.existsSync(path.dirname(filePath))).toBe(true)
      expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
    })
  })

  describe('updateGitignore', () => {
    test('creates .gitignore when it does not exist', async () => {
      promptResponses.set('Add loopwork patterns', 'y')

      await updateGitignore(deps)

      const gitignorePath = resolvePath('.gitignore')
      expect(fs.existsSync(gitignorePath)).toBe(true)
      const content = fs.readFileSync(gitignorePath, 'utf-8')
      expect(content).toContain('.loopwork/')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.env')
    })

    test('adds patterns when .gitignore exists with no loopwork patterns', async () => {
      fs.writeFileSync(resolvePath('.gitignore'), 'dist/\n*.swp\n')
      promptResponses.set('Add loopwork patterns', 'y')

      await updateGitignore(deps)

      const content = fs.readFileSync(resolvePath('.gitignore'), 'utf-8')
      expect(content).toContain('dist/')
      expect(content).toContain('*.swp')
      expect(content).toContain('.loopwork/')
      expect(content).toContain('# Loopwork')
    })

    test('skips when .gitignore already has all patterns', async () => {
      const existingContent = `.loopwork/
node_modules/
.turbo/
*.log
.env
.env.local
`
      fs.writeFileSync(resolvePath('.gitignore'), existingContent)

      await updateGitignore(deps)

      const content = fs.readFileSync(resolvePath('.gitignore'), 'utf-8')
      expect(content).toBe(existingContent)
    })

    test('adds only missing patterns when partial update needed', async () => {
      fs.writeFileSync(resolvePath('.gitignore'), '.loopwork/\nnode_modules/\n')
      promptResponses.set('Add loopwork patterns', 'y')

      await updateGitignore(deps)

      const content = fs.readFileSync(resolvePath('.gitignore'), 'utf-8')
      expect(content).toContain('.loopwork/')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.turbo/')
      expect(content).toContain('*.log')
      expect(content).toContain('.env')
      expect(content).toContain('.env.local')
    })

    test('skips update when user declines', async () => {
      const existingContent = 'dist/\n'
      fs.writeFileSync(resolvePath('.gitignore'), existingContent)
      promptResponses.set('Add loopwork patterns', 'n')

      await updateGitignore(deps)

      const content = fs.readFileSync(resolvePath('.gitignore'), 'utf-8')
      expect(content).toBe(existingContent)
    })
  })

  describe('createReadme', () => {
    test('creates README with project name and AI tool', async () => {
      await createReadme('my-awesome-project', 'opencode', deps)

      const readmePath = resolvePath('README.md')
      expect(fs.existsSync(readmePath)).toBe(true)
      const content = fs.readFileSync(readmePath, 'utf-8')
      expect(content).toContain('# my-awesome-project')
      expect(content).toContain('AI CLI: **opencode**')
      expect(content).toContain('## Quick Start')
      expect(content).toContain('bun run loopwork')
    })

    test('creates README with claude as AI tool', async () => {
      await createReadme('test-project', 'claude', deps)

      const content = fs.readFileSync(resolvePath('README.md'), 'utf-8')
      expect(content).toContain('AI CLI: **claude**')
    })

    test('skips when README exists and user says no', async () => {
      const existingContent = '# Existing README\n\nDo not overwrite'
      fs.writeFileSync(resolvePath('README.md'), existingContent)
      promptResponses.set('already exists', 'n')

      await createReadme('new-project', 'opencode', deps)

      const content = fs.readFileSync(resolvePath('README.md'), 'utf-8')
      expect(content).toBe(existingContent)
    })

    test('overwrites when README exists and user says yes', async () => {
      fs.writeFileSync(resolvePath('README.md'), '# Old README')
      promptResponses.set('already exists', 'y')

      await createReadme('new-project', 'opencode', deps)

      const content = fs.readFileSync(resolvePath('README.md'), 'utf-8')
      expect(content).toContain('# new-project')
      expect(content).not.toContain('# Old README')
    })
  })

  describe('createPrdTemplates', () => {
    test('creates templates when user says yes', async () => {
      const templatesDir = path.join(testDir, 'templates')
      promptResponses.set('Create PRD template', 'y')

      await createPrdTemplates(templatesDir, deps)

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

      await createPrdTemplates(templatesDir, deps)

      expect(fs.existsSync(path.join(templatesDir, 'feature-template.md'))).toBe(false)
      expect(fs.existsSync(path.join(templatesDir, 'bugfix-template.md'))).toBe(false)
    })

    test('creates directory if it does not exist', async () => {
      const templatesDir = path.join(testDir, 'deep', 'nested', 'templates')
      promptResponses.set('Create PRD template', 'y')

      await createPrdTemplates(templatesDir, deps)

      expect(fs.existsSync(templatesDir)).toBe(true)
    })
  })

  describe('setupPlugins', () => {
    test('enables cost tracking when user says yes', async () => {
      promptResponses.set('Enable cost tracking', 'y')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')
      readlineAnswer = '15.00'

      const plugins = await setupPlugins(deps)

      expect(plugins).toContain('withCostTracking({ dailyBudget: 15.00 })')
      expect(plugins.length).toBe(1)
    })

    test('enables telegram when user says yes', async () => {
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'y')
      promptResponses.set('Configure Discord', 'n')

      const plugins = await setupPlugins(deps)

      expect(plugins.some(p => p.includes('withTelegram'))).toBe(true)
    })

    test('enables discord when user says yes', async () => {
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'y')

      const plugins = await setupPlugins(deps)

      expect(plugins.some(p => p.includes('withDiscord'))).toBe(true)
    })

    test('enables multiple plugins together', async () => {
      promptResponses.set('Enable cost tracking', 'y')
      promptResponses.set('Configure Telegram', 'y')
      promptResponses.set('Configure Discord', 'y')
      readlineAnswer = '20.00'

      const plugins = await setupPlugins(deps)

      expect(plugins.length).toBe(3)
      expect(plugins.some(p => p.includes('withCostTracking'))).toBe(true)
      expect(plugins.some(p => p.includes('withTelegram'))).toBe(true)
      expect(plugins.some(p => p.includes('withDiscord'))).toBe(true)
    })

    test('returns empty array when no plugins selected', async () => {
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')

      const plugins = await setupPlugins(deps)

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
      readlineAnswer = '.specs/tasks'

      await init(deps)

      // Verify config file
      const configPath = resolvePath('loopwork.config.ts')
      expect(fs.existsSync(configPath)).toBe(true)
      const configContent = fs.readFileSync(configPath, 'utf-8')
      expect(configContent).toContain('withJSONBackend')
      expect(configContent).toContain("cli: 'opencode'")

      // Verify state directory
      expect(fs.existsSync(resolvePath('.loopwork'))).toBe(true)

      // Verify tasks structure
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/TASK-001.md'))).toBe(true)

      // Verify tasks.json content
      const tasksJson = JSON.parse(fs.readFileSync(resolvePath('.specs/tasks/tasks.json'), 'utf-8'))
      expect(tasksJson.tasks).toBeDefined()
      expect(tasksJson.tasks[0].id).toBe('TASK-001')

      // Verify gitignore
      expect(fs.existsSync(resolvePath('.gitignore'))).toBe(true)

      // Verify README
      expect(fs.existsSync(resolvePath('README.md'))).toBe(true)
    })

    test('initializes GitHub backend', async () => {
      promptResponses.set('Backend type', 'github')
      promptResponses.set('AI CLI tool', 'claude')
      promptResponses.set('Add loopwork patterns', 'y')
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')
      readlineAnswer = 'current repo'

      await init(deps)

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
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
      readlineAnswer = '25.00'  // Budget, then it will use default for task directory

      await init(deps)

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(configContent).toContain("from '@loopwork-ai/cost-tracking'")
      expect(configContent).toContain("from '@loopwork-ai/telegram'")
      expect(configContent).toContain('withCostTracking')
      expect(configContent).toContain('withTelegram')
    })

    test('aborts when config already exists and user says no', async () => {
      fs.writeFileSync(resolvePath('loopwork.config.ts'), '// Existing config')
      promptResponses.set('Backend type', 'json')
      promptResponses.set('AI CLI tool', 'opencode')
      promptResponses.set('already exists', 'n')
      promptResponses.set('Enable cost tracking', 'n')
      promptResponses.set('Configure Telegram', 'n')
      promptResponses.set('Configure Discord', 'n')
      readlineAnswer = '.specs/tasks'

      await init(deps)

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
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
      readlineAnswer = 'custom/tasks/dir'

      await init(deps)

      expect(fs.existsSync(resolvePath('custom/tasks/dir'))).toBe(true)
      expect(fs.existsSync(resolvePath('custom/tasks/dir/tasks.json'))).toBe(true)
      expect(fs.existsSync(resolvePath('custom/tasks/dir/TASK-001.md'))).toBe(true)

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(configContent).toContain('custom/tasks/dir/tasks.json')
    })
  })
})
