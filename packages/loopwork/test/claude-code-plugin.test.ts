import { describe, expect, test, beforeEach, afterEach, spyOn } from 'bun:test'
import { createClaudeCodePlugin, withClaudeCode } from '../src/plugins/claude-code'
import { defineConfig } from '../src/plugins'
import { logger } from '../src/core/utils'
import fs from 'fs'
import path from 'path'

const TEST_DIR = '/tmp/loopwork-claude-code-test'
const SKILLS_DIR = path.join(TEST_DIR, '.claude/skills')
const CLAUDE_MD = path.join(TEST_DIR, 'CLAUDE.md')
const CLAUDE_DIR_MD = path.join(TEST_DIR, '.claude/CLAUDE.md')
const resolveTestPath = (...segments: string[]) => path.join(TEST_DIR, ...segments)

describe('Claude Code Plugin', () => {
  let originalDir: string

  beforeEach(() => {
    // Save original directory
    originalDir = process.cwd()

    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })
    process.chdir(TEST_DIR)

    // Mock all logger methods to prevent stdout/stderr issues in CI
    spyOn(logger, 'info').mockImplementation(() => {})
    spyOn(logger, 'success').mockImplementation(() => {})
    spyOn(logger, 'warn').mockImplementation(() => {})
    spyOn(logger, 'error').mockImplementation(() => {})
    spyOn(logger, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    try {
      // Go back to original directory
      process.chdir(originalDir)
    } finally {
      // Clean up test directory
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true })
      }
    }
  })

  describe('Plugin creation', () => {
    test('creates plugin with default options', () => {
      const plugin = createClaudeCodePlugin()
      expect(plugin.name).toBe('claude-code')
      expect(typeof plugin.onConfigLoad).toBe('function')
    })

    test('creates plugin with custom options', () => {
      const plugin = createClaudeCodePlugin({
        enabled: false,
        skillsDir: 'custom/skills',
        claudeMdPath: 'custom/CLAUDE.md'
      })
      expect(plugin.name).toBe('claude-code')
    })

    test('withClaudeCode creates plugin', () => {
      const plugin = withClaudeCode()
      expect(plugin.name).toBe('claude-code')
    })
  })

  describe('Claude Code detection', () => {
    test('skips setup when Claude Code not detected', async () => {
      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      const result = await plugin.onConfigLoad!(config)

      expect(result).toBe(config)
      expect(fs.existsSync(SKILLS_DIR)).toBe(false)
    })

    test('runs setup when .claude directory exists', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      const result = await plugin.onConfigLoad!(config)

      expect(result).toBe(config)
      expect(fs.existsSync(SKILLS_DIR)).toBe(true)
      expect(fs.existsSync(path.join(SKILLS_DIR, 'loopwork.md'))).toBe(true)
    })

    test('runs setup when CLAUDE.md exists', async () => {
      fs.writeFileSync(CLAUDE_MD, '# Test')

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(fs.existsSync(SKILLS_DIR)).toBe(true)
    })

    test('runs setup when .claude/CLAUDE.md exists', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })
      fs.writeFileSync(CLAUDE_DIR_MD, '# Test')

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(fs.existsSync(SKILLS_DIR)).toBe(true)
    })

    test('skips when disabled', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin({ enabled: false })
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(fs.existsSync(SKILLS_DIR)).toBe(false)
    })
  })

  describe('Skill file generation', () => {
    test('creates skill file with correct content', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({ cli: 'claude', backend: { type: 'json' } })

      await plugin.onConfigLoad!(config)

      const skillFile = path.join(SKILLS_DIR, 'loopwork.md')
      expect(fs.existsSync(skillFile)).toBe(true)

      const content = fs.readFileSync(skillFile, 'utf-8')
      expect(content).toContain('# Loopwork Skills')
      expect(content).toContain('/loopwork:run')
      expect(content).toContain('/loopwork:resume')
      expect(content).toContain('/loopwork:status')
      expect(content).toContain('/loopwork:task-new')
      expect(content).toContain('/loopwork:config')
    })

    test('is idempotent - does not overwrite existing skill file', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      // First run
      await plugin.onConfigLoad!(config)
      const skillFile = path.join(SKILLS_DIR, 'loopwork.md')
      const originalContent = fs.readFileSync(skillFile, 'utf-8')

      // Modify file
      fs.writeFileSync(skillFile, '# Modified content')

      // Second run
      await plugin.onConfigLoad!(config)
      const modifiedContent = fs.readFileSync(skillFile, 'utf-8')

      expect(modifiedContent).toBe('# Modified content')
    })

    test('creates skills in custom directory', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const customDir = 'custom/skills'
      const plugin = createClaudeCodePlugin({ skillsDir: customDir })
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(fs.existsSync(path.join(TEST_DIR, customDir, 'loopwork.md'))).toBe(true)
    })
  })

  describe('CLAUDE.md updates', () => {
    test('creates CLAUDE.md if it does not exist', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(fs.existsSync(CLAUDE_MD)).toBe(true)
      const content = fs.readFileSync(CLAUDE_MD, 'utf-8')
      expect(content).toContain('## Loopwork Integration')
      expect(content).toContain('Claude Code Configuration')
    })

    test('appends to existing CLAUDE.md', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })
      fs.writeFileSync(CLAUDE_MD, '# Existing Content\n\nSome text.')

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      const content = fs.readFileSync(CLAUDE_MD, 'utf-8')
      expect(content).toContain('# Existing Content')
      expect(content).toContain('Some text.')
      expect(content).toContain('## Loopwork Integration')
    })

    test('prefers .claude/CLAUDE.md if both exist', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })
      fs.writeFileSync(CLAUDE_MD, '# Root CLAUDE.md')
      fs.writeFileSync(CLAUDE_DIR_MD, '# Dir CLAUDE.md')

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      const content = fs.readFileSync(CLAUDE_DIR_MD, 'utf-8')
      expect(content).toContain('## Loopwork Integration')

      const rootContent = fs.readFileSync(CLAUDE_MD, 'utf-8')
      expect(rootContent).not.toContain('## Loopwork Integration')
    })

    test('is idempotent - does not duplicate Loopwork section', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      // First run
      await plugin.onConfigLoad!(config)
      const firstContent = fs.readFileSync(CLAUDE_MD, 'utf-8')
      const firstCount = (firstContent.match(/## Loopwork Integration/g) || []).length
      expect(firstCount).toBe(1)

      // Second run
      await plugin.onConfigLoad!(config)
      const secondContent = fs.readFileSync(CLAUDE_MD, 'utf-8')
      const secondCount = (secondContent.match(/## Loopwork Integration/g) || []).length
      expect(secondCount).toBe(1)
    })

    test('includes backend type in CLAUDE.md', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({ backend: { type: 'github', repo: 'test/repo' } })

      await plugin.onConfigLoad!(config)

      const content = fs.readFileSync(CLAUDE_MD, 'utf-8')
      expect(content).toContain('**Backend**: github')
    })

    test('includes CLI tool in CLAUDE.md', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({ cli: 'gemini' })

      await plugin.onConfigLoad!(config)

      const content = fs.readFileSync(CLAUDE_MD, 'utf-8')
      expect(content).toContain('**AI CLI**: gemini')
      expect(content).toContain('AI CLI (gemini)')
    })

    test('uses custom CLAUDE.md path', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const customPath = 'docs/CLAUDE.md'
      fs.mkdirSync(resolveTestPath('docs'), { recursive: true })

      const plugin = createClaudeCodePlugin({ claudeMdPath: customPath })
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(fs.existsSync(path.join(TEST_DIR, customPath))).toBe(true)
    })
  })

  describe('Logging', () => {
    test('logs success when skill file created', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      // Re-mock to track calls (global mock is already active)
      const successSpy = spyOn(logger, 'success').mockImplementation(() => {})

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('loopwork.md'))
    })

    test('logs success when CLAUDE.md updated', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      // Re-mock to track calls (global mock is already active)
      const successSpy = spyOn(logger, 'success').mockImplementation(() => {})

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'))
    })

    test('logs info when CLAUDE.md already has Loopwork section', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })
      fs.writeFileSync(CLAUDE_MD, '## Loopwork Integration\n\nExisting')

      // Re-mock to track calls (global mock is already active)
      const infoSpy = spyOn(logger, 'info').mockImplementation(() => {})

      const plugin = createClaudeCodePlugin()
      const config = defineConfig({})

      await plugin.onConfigLoad!(config)

      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('already has Loopwork'))
    })
  })

  describe('Config composition', () => {
    test('works with defineConfig', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const config = defineConfig({
        cli: 'claude',
        backend: { type: 'json', tasksFile: 'custom.json' }
      })

      const plugin = createClaudeCodePlugin()
      const result = await plugin.onConfigLoad!(config)

      expect(result).toBe(config)
      expect(fs.existsSync(SKILLS_DIR)).toBe(true)
    })

    test('preserves existing config properties', async () => {
      fs.mkdirSync(resolveTestPath('.claude'), { recursive: true })

      const config = defineConfig({
        cli: 'claude',
        maxIterations: 100,
        backend: { type: 'json' },
        plugins: [{ name: 'test', onConfigLoad: async (c: any) => c }]
      })

      const plugin = createClaudeCodePlugin()
      const result = await plugin.onConfigLoad!(config)

      expect(result.cli).toBe('claude')
      expect(result.maxIterations).toBe(100)
      expect(result.plugins).toHaveLength(1)
    })
  })
})
