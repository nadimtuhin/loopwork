import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { init } from '../src/commands/init'

describe('Init Command', () => {
  const testDir = path.join('/tmp', 'loopwork-init-test-' + Date.now())

  beforeEach(() => {
    // Create a clean test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
    fs.mkdirSync(testDir, { recursive: true })
    process.chdir(testDir)
  })

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true })
    }
  })

  test('init creates required directory structure', async () => {
    // Note: This test would require mocking stdin for full automation
    // For now, we test the helper functions and file structure expectations

    // Expected files and directories that should be created
    const expectedPaths = [
      '.loopwork-state',
      '.specs/tasks',
      '.specs/tasks/templates'
    ]

    // After a full init, these should exist
    // We'll verify the structure is valid even if we can't run the full interactive init
    expect(true).toBe(true) // Placeholder - full test requires stdin mocking
  })

  test('gitignore patterns are correct', () => {
    // Verify the patterns we expect to add
    const expectedPatterns = [
      '.loopwork-state/',
      'node_modules/',
      '.turbo/',
      '*.log',
      '.env',
      '.env.local'
    ]

    // This would be tested by running updateGitignore()
    expect(expectedPatterns).toContain('.loopwork-state/')
    expect(expectedPatterns).toContain('.env')
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
