import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { getConfig } from '../src/core/config'
import { LoopworkError } from '../src/core/errors'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('Config Validation', () => {
  let testDir: string
  let originalEnv: Record<string, string | undefined>
  let originalCwd: string

  beforeEach(() => {
    // Save original environment
    originalEnv = {
      LOOPWORK_BACKEND: process.env.LOOPWORK_BACKEND,
      LOOPWORK_NON_INTERACTIVE: process.env.LOOPWORK_NON_INTERACTIVE,
      LOOPWORK_DEBUG: process.env.LOOPWORK_DEBUG,
      LOOPWORK_NAMESPACE: process.env.LOOPWORK_NAMESPACE,
    }

    originalCwd = process.cwd()

    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-test-'))
    fs.writeFileSync(path.join(testDir, 'package.json'), '{}')

    process.chdir(testDir)
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
    } finally {
      try {
        process.chdir(originalCwd)
      } finally {
        fs.rmSync(testDir, { recursive: true, force: true })
      }
    }
  })

  describe('Environment variable validation', () => {
    test('rejects invalid LOOPWORK_BACKEND', async () => {
      process.env.LOOPWORK_BACKEND = 'invalid'

      try {
        await getConfig({ backend: 'json', tasksFile: path.join(testDir, 'tasks.json') })
        expect(true).toBe(false) // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid LOOPWORK_BACKEND')
        expect((error as LoopworkError).suggestions).toContainEqual('Valid values: "json" or "github"')
      }
    })

    test('accepts valid LOOPWORK_BACKEND values', async () => {
      process.env.LOOPWORK_BACKEND = 'json'
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.mkdirSync(path.dirname(tasksFile), { recursive: true })
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ tasksFile })
      expect(config.backend.type).toBe('json')
    })

    test('rejects invalid LOOPWORK_NON_INTERACTIVE', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'yes'

      try {
        await getConfig({ backend: 'json', tasksFile: path.join(testDir, 'tasks.json') })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid LOOPWORK_NON_INTERACTIVE')
      }
    })

    test('rejects invalid LOOPWORK_DEBUG', async () => {
      process.env.LOOPWORK_DEBUG = '1'

      try {
        await getConfig({ backend: 'json', tasksFile: path.join(testDir, 'tasks.json') })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid LOOPWORK_DEBUG')
      }
    })
  })

  describe('CLI validation', () => {
    test('rejects invalid CLI', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ cli: 'invalid', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid CLI')
        expect((error as LoopworkError).suggestions).toContainEqual('Supported CLIs: opencode, claude, gemini')
      }
    })

    test('accepts valid CLIs', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      for (const cli of ['opencode', 'claude', 'gemini']) {
        const config = await getConfig({ cli, backend: 'json', tasksFile })
        expect(config.cli).toBe(cli)
      }
    })
  })

  describe('maxIterations validation', () => {
    test('rejects zero maxIterations', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ maxIterations: '0', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid maxIterations')
        expect((error as LoopworkError).suggestions).toContainEqual('maxIterations must be a positive number')
      }
    })

    test('rejects negative maxIterations', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ maxIterations: '-5', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid maxIterations')
      }
    })

    test('accepts positive maxIterations', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ maxIterations: '100', backend: 'json', tasksFile })
      expect(config.maxIterations).toBe(100)
    })
  })

  describe('timeout validation', () => {
    test('rejects zero timeout', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ timeout: '0', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid timeout')
        expect((error as LoopworkError).suggestions).toContainEqual('timeout must be a positive number (in seconds)')
      }
    })

    test('rejects negative timeout', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ timeout: '-10', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid timeout')
      }
    })

    test('accepts positive timeout', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ timeout: '3600', backend: 'json', tasksFile })
      expect(config.timeout).toBe(3600)
    })
  })

  describe('JSON backend validation', () => {
    test('rejects non-existent tasks directory', async () => {
      const tasksFile = path.join(testDir, 'nonexistent', 'tasks.json')

      try {
        await getConfig({ backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Tasks directory does not exist')
        expect((error as LoopworkError).suggestions.join('\n')).toContain('mkdir -p')
      }
    })

    test('accepts existing tasks file', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ backend: 'json', tasksFile })
      expect(config.backend.type).toBe('json')
      expect(config.backend.tasksFile).toBe(tasksFile)
    })

    test('accepts writable directory for non-existent tasks file', async () => {
      const tasksDir = path.join(testDir, 'tasks')
      fs.mkdirSync(tasksDir)
      const tasksFile = path.join(tasksDir, 'tasks.json')

      const config = await getConfig({ backend: 'json', tasksFile })
      expect(config.backend.type).toBe('json')
      expect(config.backend.tasksFile).toBe(tasksFile)
    })
  })

  describe('GitHub backend validation', () => {
    test('rejects invalid repository format', async () => {
      try {
        await getConfig({ backend: 'github', repo: 'invalid-repo-format' })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid GitHub repository format')
        expect((error as LoopworkError).suggestions).toContainEqual('Repository must be in format: owner/repo')
      }
    })

    test('accepts valid repository format', async () => {
      const config = await getConfig({ backend: 'github', repo: 'owner/repo' })
      expect(config.backend.type).toBe('github')
      expect(config.backend.repo).toBe('owner/repo')
    })

    test('accepts owner/repo with special characters', async () => {
      const config = await getConfig({ backend: 'github', repo: 'my-org/my.repo_name' })
      expect(config.backend.type).toBe('github')
      expect(config.backend.repo).toBe('my-org/my.repo_name')
    })

    test('accepts undefined repo (auto-detect)', async () => {
      const config = await getConfig({ backend: 'github' })
      expect(config.backend.type).toBe('github')
      expect(config.backend.repo).toBeUndefined()
    })
  })

  describe('Missing config file detection', () => {
    test('detects wrong file extension', async () => {
      const wrongConfigPath = path.join(testDir, 'loopwork.config.json')
      fs.writeFileSync(wrongConfigPath, '{}')

      // Note: beforeEach already changed to testDir, no need to chdir again
      try {
        await getConfig({})
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Found config file with wrong format')
        expect((error as LoopworkError).suggestions).toContainEqual('Rename to: loopwork.config.ts or loopwork.config.js')
      }
    })

    test('shows all checked paths in error', async () => {
      try {
        await getConfig({})
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('loopwork.config.ts not found')
        expect((error as LoopworkError).suggestions.join('\n')).toContain('loopwork.config.ts')
        expect((error as LoopworkError).suggestions.join('\n')).toContain('loopwork.config.js')
      }
    })
  })

  describe('Model ID validation', () => {
    test('accepts valid claude model IDs', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const validModels = [
        'claude-sonnet-4-5',
        'claude-opus-3-5',
        'claude-haiku-3-5',
        'claude-3-opus-20240229',
        'claude-2-1',
      ]

      for (const model of validModels) {
        const config = await getConfig({ model, backend: 'json', tasksFile })
        expect(config.model).toBe(model)
      }
    })

    test('accepts valid gpt model IDs', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const validModels = [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'gpt-4-0613',
        'gpt-3-5-turbo-16k',
      ]

      for (const model of validModels) {
        const config = await getConfig({ model, backend: 'json', tasksFile })
        expect(config.model).toBe(model)
      }
    })

    test('accepts valid gemini model IDs', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const validModels = [
        'gemini-pro',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-ultra',
      ]

      for (const model of validModels) {
        const config = await getConfig({ model, backend: 'json', tasksFile })
        expect(config.model).toBe(model)
      }
    })

    test('rejects invalid model IDs', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const invalidModels = [
        'invalid-model',
        'llama-2',
        'mistral-7b',
        'palm-2',
        'random-string',
      ]

      for (const model of invalidModels) {
        try {
          await getConfig({ model, backend: 'json', tasksFile })
          expect(true).toBe(false) // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(LoopworkError)
          expect((error as LoopworkError).message).toContain('Invalid model ID')
          expect((error as LoopworkError).message).toContain(model)
        }
      }
    })

    test('suggests claude-sonnet-4-5 for sonnet without prefix', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ model: 'sonnet', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).suggestions.join('\n')).toContain('claude-sonnet-4-5')
      }
    })

    test('suggests claude-opus-3-5 for opus without prefix', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ model: 'opus', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).suggestions.join('\n')).toContain('claude-opus-3-5')
      }
    })

    test('suggests claude-haiku-3-5 for haiku without prefix', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ model: 'haiku', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).suggestions.join('\n')).toContain('claude-haiku-3-5')
      }
    })

    test('suggests gpt-4 for 4 or gpt4', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const invalidGptModels = ['4', 'gpt4', 'GPT-4']
      for (const model of invalidGptModels) {
        try {
          await getConfig({ model, backend: 'json', tasksFile })
          expect(true).toBe(false)
        } catch (error) {
          expect(error).toBeInstanceOf(LoopworkError)
          expect((error as LoopworkError).suggestions.join('\n')).toContain('gpt-4')
        }
      }
    })

    test('suggests gpt-3.5-turbo for 3 or gpt3', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const invalidGptModels = ['3', 'gpt3', 'GPT-3']
      for (const model of invalidGptModels) {
        try {
          await getConfig({ model, backend: 'json', tasksFile })
          expect(true).toBe(false)
        } catch (error) {
          expect(error).toBeInstanceOf(LoopworkError)
          expect((error as LoopworkError).suggestions.join('\n')).toContain('gpt-3.5-turbo')
        }
      }
    })

    test('suggests gemini models for gemini without prefix', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ model: 'pro-gemini', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).suggestions.join('\n')).toContain('gemini-pro')
      }
    })

    test('allows undefined model', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ backend: 'json', tasksFile })
      expect(config.model).toBeUndefined()
    })

    test('shows all valid model formats in error message', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ model: 'invalid', backend: 'json', tasksFile })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        const suggestions = (error as LoopworkError).suggestions.join('\n')
        expect(suggestions).toContain('claude-*')
        expect(suggestions).toContain('gpt-*')
        expect(suggestions).toContain('gemini-*')
        expect(suggestions).toContain('claude-sonnet-4-5')
        expect(suggestions).toContain('gpt-4')
        expect(suggestions).toContain('gemini-pro')
      }
    })
  })

  describe('Priority validation', () => {
    test('rejects priority less than 1', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ backend: 'json', tasksFile, defaultPriority: 0 })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid defaultPriority')
        expect((error as LoopworkError).suggestions).toContainEqual('defaultPriority must be an integer between 1 and 5')
      }
    })

    test('rejects priority greater than 5', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ backend: 'json', tasksFile, defaultPriority: 6 })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid defaultPriority')
      }
    })

    test('rejects negative priority', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ backend: 'json', tasksFile, defaultPriority: -1 })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid defaultPriority')
      }
    })

    test('rejects non-integer priority', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      try {
        await getConfig({ backend: 'json', tasksFile, defaultPriority: 2.5 })
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeInstanceOf(LoopworkError)
        expect((error as LoopworkError).message).toContain('Invalid defaultPriority')
      }
    })

    test('accepts priority 1', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ backend: 'json', tasksFile, defaultPriority: 1 })
      expect(config.defaultPriority).toBe(1)
    })

    test('accepts priority 5', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ backend: 'json', tasksFile, defaultPriority: 5 })
      expect(config.defaultPriority).toBe(5)
    })

    test('accepts priority 3 (middle value)', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ backend: 'json', tasksFile, defaultPriority: 3 })
      expect(config.defaultPriority).toBe(3)
    })

    test('accepts undefined priority (optional field)', async () => {
      const tasksFile = path.join(testDir, 'tasks.json')
      fs.writeFileSync(tasksFile, '{}')

      const config = await getConfig({ backend: 'json', tasksFile })
      expect(config.defaultPriority).toBeUndefined()
    })
  })
})
