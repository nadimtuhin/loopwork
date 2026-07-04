import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  ChangelogProvider,
  createChangelogProvider,
} from '../src/changelog-provider'
import type { ChangelogContext, ChangelogConfig } from '@loopwork-ai/contracts'

describe('ChangelogProvider', () => {
  let tempDir: string
  let provider: ChangelogProvider

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-changelog-test-'))
    provider = createChangelogProvider({
      logger: {
        debug: () => {},
        success: () => {},
        warn: () => {},
      },
    })
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('updateChangelog', () => {
    test('creates changelog if it does not exist', () => {
      const changelogPath = path.join(tempDir, 'CHANGELOG.md')
      const entry = '### Added\n- New feature'

      provider.updateChangelog(changelogPath, entry)

      expect(fs.existsSync(changelogPath)).toBe(true)
      const content = fs.readFileSync(changelogPath, 'utf-8')
      expect(content).toContain('### Added')
      expect(content).toContain('New feature')
    })

    test('inserts entry after header', () => {
      const changelogPath = path.join(tempDir, 'CHANGELOG.md')
      const existingContent = `# Changelog

## [Unreleased]

## [1.0.0] - 2024-01-01

### Added
- Initial release
`
      fs.writeFileSync(changelogPath, existingContent, 'utf-8')

      const entry = '### Added\n- New feature'
      provider.updateChangelog(changelogPath, entry)

      const content = fs.readFileSync(changelogPath, 'utf-8')
      const lines = content.split('\n')
      const unreleasedIndex = lines.findIndex((l) => l.includes('[Unreleased]'))

      expect(unreleasedIndex).toBeGreaterThan(-1)
      const addedIndex = lines.findIndex((l, i) => i > unreleasedIndex && l.includes('### Added'))
      expect(addedIndex).toBeGreaterThan(unreleasedIndex)
    })

    test('appends to end if no header found', () => {
      const changelogPath = path.join(tempDir, 'CHANGELOG.md')
      const existingContent = `No header here
Just some content
`
      fs.writeFileSync(changelogPath, existingContent, 'utf-8')

      const entry = '### Added\n- New feature'
      provider.updateChangelog(changelogPath, entry)

      const content = fs.readFileSync(changelogPath, 'utf-8')
      expect(content).toContain('No header here')
      expect(content).toContain('### Added')
      expect(content).toContain('New feature')
    })

    test('handles empty changelog', () => {
      const changelogPath = path.join(tempDir, 'CHANGELOG.md')
      fs.writeFileSync(changelogPath, '', 'utf-8')

      const entry = '### Added\n- New feature'
      provider.updateChangelog(changelogPath, entry)

      const content = fs.readFileSync(changelogPath, 'utf-8')
      expect(content).toContain('### Added')
      expect(content).toContain('New feature')
    })

    test('does nothing for empty entry', () => {
      const changelogPath = path.join(tempDir, 'CHANGELOG.md')
      const existingContent = '# Changelog\n\n## [1.0.0]\n'
      fs.writeFileSync(changelogPath, existingContent, 'utf-8')

      provider.updateChangelog(changelogPath, '   ')

      const content = fs.readFileSync(changelogPath, 'utf-8')
      expect(content).toBe(existingContent)
    })
  })

  describe('generateEntry', () => {
    test('returns noUpdateNeeded for failed tasks', async () => {
      const context: ChangelogContext = {
        taskId: 'TASK-001',
        title: 'Test task',
        success: false,
        error: 'Failed',
      }

      const result = await provider.generateEntry(context, {
        format: 'keepachangelog',
        includeTaskId: true,
        maxLines: 10,
      })

      expect(result.noUpdateNeeded).toBe(true)
      expect(result.entry).toBe('')
    })

    test('returns entry for successful tasks', async () => {
      const context: ChangelogContext = {
        taskId: 'TASK-001',
        title: 'Add new feature',
        description: 'Implement user authentication',
        success: true,
      }

      const result = await provider.generateEntry(context, {
        format: 'keepachangelog',
        includeTaskId: true,
        maxLines: 10,
      })

      expect(result.noUpdateNeeded).toBe(false)
      expect(result.entry).toContain('TASK-001')
      expect(result.entry).toContain('Add new feature')
      expect(result.entry).toContain('CHANGELOG')
    })
  })

  describe('buildPrompt', () => {
    test('includes task information', () => {
      const context: ChangelogContext = {
        taskId: 'TASK-001',
        title: 'Test task',
        description: 'Test description',
        success: true,
      }

      const prompt = provider.buildPrompt(context, '', {
        format: 'keepachangelog',
        includeTaskId: true,
        maxLines: 10,
      })

      expect(prompt).toContain('TASK-001')
      expect(prompt).toContain('Test task')
      expect(prompt).toContain('Test description')
    })

    test('respects includeTaskId setting', () => {
      const context: ChangelogContext = {
        taskId: 'TASK-001',
        title: 'Test task',
        success: true,
      }

      const promptWithId = provider.buildPrompt(context, '', {
        format: 'keepachangelog',
        includeTaskId: true,
        maxLines: 10,
      })

      const promptWithoutId = provider.buildPrompt(context, '', {
        format: 'keepachangelog',
        includeTaskId: false,
        maxLines: 10,
      })

      expect(promptWithId).toContain('Include the task ID')
      expect(promptWithoutId).toContain('Do not include task IDs')
    })

    test('respects maxLines setting', () => {
      const context: ChangelogContext = {
        taskId: 'TASK-001',
        title: 'Test task',
        success: true,
      }

      const prompt = provider.buildPrompt(context, '', {
        format: 'keepachangelog',
        includeTaskId: true,
        maxLines: 5,
      })

      expect(prompt).toContain('max 5 lines')
    })

    test('includes current changelog content', () => {
      const context: ChangelogContext = {
        taskId: 'TASK-001',
        title: 'Test task',
        success: true,
      }

      const currentChangelog = `# Changelog

## [1.0.0] - 2024-01-01
### Added
- Initial release
`

      const prompt = provider.buildPrompt(context, currentChangelog, {
        format: 'keepachangelog',
        includeTaskId: true,
        maxLines: 10,
      })

      expect(prompt).toContain('Initial release')
    })
  })

  describe('createChangelogProvider', () => {
    test('creates provider with options', () => {
      const customLogger = {
        debug: () => {},
        success: () => {},
        warn: () => {},
      }
      const p = createChangelogProvider({ logger: customLogger })

      expect(p).toBeInstanceOf(ChangelogProvider)
    })

    test('creates provider without options', () => {
      const p = createChangelogProvider()

      expect(p).toBeInstanceOf(ChangelogProvider)
    })
  })
})
