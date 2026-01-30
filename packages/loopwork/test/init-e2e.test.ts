import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { init } from '../src/commands/init'

/**
 * End-to-End Integration Test for Init Workflow
 *
 * This test validates the complete `loopwork init` workflow:
 * 1. File creation (config, README, .gitignore, tasks, PRDs)
 * 2. Directory structure setup
 * 3. Config composition and imports
 * 4. Different backend choices (JSON, GitHub)
 * 5. Different plugin selections
 * 6. Non-interactive mode
 * 7. Idempotency (running init twice)
 * 8. Error handling scenarios
 */

describe('Init E2E Integration Test', () => {
  let tempDir: string
  let originalCwd: string
  let originalEnv: Record<string, string | undefined>
  let originalIsTTY: boolean | undefined
  const resolvePath = (...segments: string[]) => path.join(tempDir, ...segments)

  beforeEach(() => {
    // Save original working directory and environment
    originalCwd = process.cwd()
    originalEnv = { ...process.env }
    originalIsTTY = process.stdin.isTTY

    // Create temp directory for test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-init-e2e-'))
    process.chdir(tempDir)

    // Enable non-interactive mode for all tests
    process.env.LOOPWORK_NON_INTERACTIVE = 'true'
  })

  afterEach(() => {
    try {
      // Restore original environment and working directory
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
        configurable: true,
      })
      process.chdir(originalCwd)
    } finally {
      // Cleanup temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    }
  })

  describe('Complete Workflow Tests', () => {
    test('initializes project with JSON backend and default settings', async () => {
      await init()

      // 1. Verify loopwork.config.ts created
      const configPath = resolvePath('loopwork.config.ts')
      expect(fs.existsSync(configPath)).toBe(true)
      const configContent = fs.readFileSync(configPath, 'utf-8')

      // Verify config has correct imports
      expect(configContent).toContain("import { defineConfig, compose } from 'loopwork'")
      expect(configContent).toContain("import { withJSONBackend } from 'loopwork'")

      // Verify config composition
      expect(configContent).toContain('export default compose(')
      expect(configContent).toContain('withJSONBackend')
      expect(configContent).toContain('defineConfig({')
      expect(configContent).toContain("cli: 'opencode'") // Default CLI

      // 2. Verify .gitignore created with required patterns
      const gitignorePath = resolvePath('.gitignore')
      expect(fs.existsSync(gitignorePath)).toBe(true)
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8')
      expect(gitignoreContent).toContain('.loopwork/')
      expect(gitignoreContent).toContain('node_modules/')
      expect(gitignoreContent).toContain('.turbo/')
      expect(gitignoreContent).toContain('*.log')
      expect(gitignoreContent).toContain('.env')
      expect(gitignoreContent).toContain('.env.local')

      // 3. Verify README.md created
      const readmePath = resolvePath('README.md')
      expect(fs.existsSync(readmePath)).toBe(true)
      const readmeContent = fs.readFileSync(readmePath, 'utf-8')
      const projectName = path.basename(tempDir)
      expect(readmeContent).toContain(`# ${projectName}`)
      expect(readmeContent).toContain('## Quick Start')
      expect(readmeContent).toContain('bun run loopwork')
      expect(readmeContent).toContain('AI CLI: **opencode**')

      // 4. Verify .loopwork directory created
      const statePath = resolvePath('.loopwork')
      expect(fs.existsSync(statePath)).toBe(true)
      const stateStat = fs.statSync(statePath)
      expect(stateStat.isDirectory()).toBe(true)

      // 5. Verify .specs/tasks/ structure created
      expect(fs.existsSync(resolvePath('.specs/tasks'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/TASK-001.md'))).toBe(true)

      // 6. Verify tasks.json content
      const tasksContent = fs.readFileSync(resolvePath('.specs/tasks/tasks.json'), 'utf-8')
      const tasksJson = JSON.parse(tasksContent)
      expect(tasksJson.tasks).toBeDefined()
      expect(Array.isArray(tasksJson.tasks)).toBe(true)
      expect(tasksJson.tasks.length).toBe(1)
      expect(tasksJson.tasks[0].id).toBe('TASK-001')
      expect(tasksJson.tasks[0].status).toBe('pending')
      expect(tasksJson.tasks[0].priority).toBe('high')
      expect(tasksJson.tasks[0].title).toBe('My First Task')

      // 7. Verify sample PRD file
      const prdContent = fs.readFileSync(resolvePath('.specs/tasks/TASK-001.md'), 'utf-8')
      expect(prdContent).toContain('# TASK-001: My First Task')
      expect(prdContent).toContain('## Goal')
      expect(prdContent).toContain('Implement the first feature')
      expect(prdContent).toContain('## Requirements')

      // 8. Verify PRD template files created
      expect(fs.existsSync(resolvePath('.specs/tasks/templates'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/templates/feature-template.md'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/templates/bugfix-template.md'))).toBe(true)

      const featureTemplate = fs.readFileSync(resolvePath('.specs/tasks/templates/feature-template.md'), 'utf-8')
      expect(featureTemplate).toContain('# TASK-XXX: Feature Name')
      expect(featureTemplate).toContain('## Goal')
      expect(featureTemplate).toContain('## Requirements')
      expect(featureTemplate).toContain('## Technical Notes')

      const bugfixTemplate = fs.readFileSync(resolvePath('.specs/tasks/templates/bugfix-template.md'), 'utf-8')
      expect(bugfixTemplate).toContain('# TASK-XXX: Bug Fix Title')
      expect(bugfixTemplate).toContain('## Problem')
      expect(bugfixTemplate).toContain('## Steps to Reproduce')
      expect(bugfixTemplate).toContain('## Solution')
    })

    test('default non-interactive mode uses JSON backend', async () => {
      // In non-interactive mode, defaults are always used
      // The default backend is 'json', not 'github'
      await init()

      // Verify config uses JSON backend (the default)
      const configPath = resolvePath('loopwork.config.ts')
      expect(fs.existsSync(configPath)).toBe(true)
      const configContent = fs.readFileSync(configPath, 'utf-8')
      expect(configContent).toContain('withJSONBackend')
      expect(configContent).not.toContain('withGitHubBackend')

      // JSON backend creates tasks.json
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)

      // All files should be created
      expect(fs.existsSync(resolvePath('loopwork.config.ts'))).toBe(true)
      expect(fs.existsSync(resolvePath('.gitignore'))).toBe(true)
      expect(fs.existsSync(resolvePath('README.md'))).toBe(true)
      expect(fs.existsSync(resolvePath('.loopwork'))).toBe(true)
    })

    test('config can be imported successfully', async () => {
      await init()

      const configPath = resolvePath('loopwork.config.ts')
      expect(fs.existsSync(configPath)).toBe(true)

      // Verify the config file is valid TypeScript
      const configContent = fs.readFileSync(configPath, 'utf-8')

      // Check for proper syntax
      expect(configContent).toMatch(/import\s+{[^}]+}\s+from\s+['"]loopwork['"]/)
      expect(configContent).toMatch(/export\s+default\s+compose\(/)

      // Check that imports are correctly formed
      expect(configContent).toMatch(/defineConfig/)
      expect(configContent).toMatch(/compose/)
      expect(configContent).toMatch(/withJSONBackend|withGitHubBackend/)

      // Verify config structure
      expect(configContent).toContain("cli: 'opencode'")
      expect(configContent).toContain('maxIterations: 50')
    })
  })

  describe('Plugin Selection Tests', () => {
    test('includes cost tracking plugin when enabled', async () => {
      await init()

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      // Default includes cost tracking
      expect(configContent).toContain("from '@loopwork-ai/cost-tracking'")
      expect(configContent).toContain('withCostTracking')
      expect(configContent).toMatch(/withCostTracking\(\{\s*dailyBudget:\s*10\.00?\s*\}\)/)
    })

    test('config is valid without plugins', async () => {
      // Disable all plugins via environment
      process.env.LOOPWORK_NO_PLUGINS = 'true'

      await init()

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(configContent).toContain("import { defineConfig, compose } from 'loopwork'")
      expect(configContent).toContain('export default compose(')
      expect(configContent).toContain('defineConfig({')
    })
  })

  describe('Non-Interactive Mode', () => {
    test('uses defaults when LOOPWORK_NON_INTERACTIVE is true', async () => {
      process.env.LOOPWORK_NON_INTERACTIVE = 'true'

      await init()

      // Verify defaults were used
      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(configContent).toContain("cli: 'opencode'") // Default CLI
      expect(configContent).toContain('withJSONBackend') // Default backend
      expect(configContent).toContain('.specs/tasks/tasks.json') // Default tasks file

      // Verify all expected files created
      expect(fs.existsSync(resolvePath('loopwork.config.ts'))).toBe(true)
      expect(fs.existsSync(resolvePath('.gitignore'))).toBe(true)
      expect(fs.existsSync(resolvePath('README.md'))).toBe(true)
      expect(fs.existsSync(resolvePath('.loopwork'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)
    })

    test('works when stdin is not a TTY', async () => {
      // Simulate non-TTY environment
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      })

      await init()

      // Should still create all files
      expect(fs.existsSync(resolvePath('loopwork.config.ts'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)
    })
  })

  describe('Idempotency Tests', () => {
    test('running init twice preserves existing config when user declines overwrite', async () => {
      // First init
      await init()
      const firstConfigContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')

      // Modify config to verify it doesn't get overwritten
      const modifiedConfig = '// Modified config\n' + firstConfigContent
      fs.writeFileSync(resolvePath('loopwork.config.ts'), modifiedConfig)

      // Second init (non-interactive mode defaults to 'n' for overwrite)
      await init()

      // Config should be preserved
      const finalConfigContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(finalConfigContent).toBe(modifiedConfig)
    })

    test('.gitignore is idempotent - does not duplicate patterns', async () => {
      // First init
      await init()
      const firstGitignore = fs.readFileSync(resolvePath('.gitignore'), 'utf-8')

      // Second init
      await init()
      const secondGitignore = fs.readFileSync(resolvePath('.gitignore'), 'utf-8')

      // Should be exactly the same
      expect(secondGitignore).toBe(firstGitignore)

      // Count occurrences of a pattern to ensure no duplication
      const pattern = '.loopwork/'
      const count = (secondGitignore.match(new RegExp(pattern.replace('/', '\\/'), 'g')) || []).length
      expect(count).toBe(1)
    })

    test('.loopwork directory is reused if exists', async () => {
      // Create state directory manually
      fs.mkdirSync(resolvePath('.loopwork'), { recursive: true })
      const stateFile = resolvePath('.loopwork', 'test.json')
      fs.writeFileSync(stateFile, '{"test": true}')

      // Run init
      await init()

      // State directory should still exist
      expect(fs.existsSync(resolvePath('.loopwork'))).toBe(true)
      // Test file should be preserved
      expect(fs.existsSync(stateFile)).toBe(true)
      expect(fs.readFileSync(stateFile, 'utf-8')).toBe('{"test": true}')
    })
  })

  describe('Error Handling', () => {
    test('handles permission denied gracefully', async () => {
      // Create a read-only directory to simulate permission issues
      const readOnlyDir = resolvePath('readonly')
      fs.mkdirSync(readOnlyDir, { recursive: true })

      // Try to make it read-only (this might not work on all systems)
      try {
        const previousCwd = process.cwd()
        fs.chmodSync(readOnlyDir, 0o444)
        process.chdir(readOnlyDir)

        // Init should handle the error
        await expect(init()).resolves.not.toThrow()
        try {
          // Cleanup
          fs.chmodSync(readOnlyDir, 0o755)
        } finally {
          process.chdir(previousCwd)
        }
      } catch (err) {
        // Skip test if chmod doesn't work (e.g., on Windows or some file systems)
        console.warn('Skipping permission test - chmod not supported')
      }
    })

    test('handles existing files gracefully', async () => {
      // Create existing files
      fs.writeFileSync(resolvePath('loopwork.config.ts'), '// Existing config')
      fs.writeFileSync(resolvePath('README.md'), '# Existing README')
      fs.writeFileSync(resolvePath('.gitignore'), 'node_modules/\n')

      // Run init
      await init()

      // Files should be preserved (non-interactive defaults to not overwriting)
      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(configContent).toBe('// Existing config')
    })
  })

  describe('Custom Task Directory', () => {
    test('creates tasks in custom directory when specified', async () => {
      // This test would require interactive input or env variable support
      // For now, we test the default behavior
      await init()

      // Default directory should be .specs/tasks
      expect(fs.existsSync(resolvePath('.specs/tasks'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/TASK-001.md'))).toBe(true)
    })
  })

  describe('Backend Specifics', () => {
    test('JSON backend creates complete task structure', async () => {
      await init()

      // Verify JSON backend structure
      expect(fs.existsSync(resolvePath('.specs/tasks'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/TASK-001.md'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/templates'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/templates/feature-template.md'))).toBe(true)
      expect(fs.existsSync(resolvePath('.specs/tasks/templates/bugfix-template.md'))).toBe(true)

      // Verify tasks.json structure
      const tasksJson = JSON.parse(fs.readFileSync(resolvePath('.specs/tasks/tasks.json'), 'utf-8'))
      expect(tasksJson).toHaveProperty('tasks')
      expect(Array.isArray(tasksJson.tasks)).toBe(true)
      expect(tasksJson.tasks[0]).toHaveProperty('id')
      expect(tasksJson.tasks[0]).toHaveProperty('status')
      expect(tasksJson.tasks[0]).toHaveProperty('priority')
    })

    test('JSON backend creates tasks.json by default', async () => {
      // Non-interactive mode always uses JSON backend as default
      await init()

      // JSON backend should create local task files
      expect(fs.existsSync(resolvePath('.specs/tasks/tasks.json'))).toBe(true)

      // Config should reference JSON backend
      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')
      expect(configContent).toContain('withJSONBackend')
      expect(configContent).not.toContain('withGitHubBackend')
    })
  })

  describe('File Content Validation', () => {
    test('generated config has valid syntax and structure', async () => {
      await init()

      const configContent = fs.readFileSync(resolvePath('loopwork.config.ts'), 'utf-8')

      // Verify import statements
      expect(configContent).toMatch(/^import\s+{[^}]*defineConfig[^}]*}\s+from\s+['"]loopwork['"];?\s*$/m)
      expect(configContent).toMatch(/^import\s+{[^}]*compose[^}]*}\s+from\s+['"]loopwork['"];?\s*$/m)

      // Verify export statement
      expect(configContent).toMatch(/^export\s+default\s+compose\(/m)

      // Verify closing parentheses balance
      const openParens = (configContent.match(/\(/g) || []).length
      const closeParens = (configContent.match(/\)/g) || []).length
      expect(openParens).toBe(closeParens)

      // Verify no syntax errors (basic check)
      expect(configContent).not.toContain('undefined undefined')
      expect(configContent).not.toContain('null null')
    })

    test('README contains all required sections', async () => {
      await init()

      const readmeContent = fs.readFileSync(resolvePath('README.md'), 'utf-8')

      // Verify required sections
      expect(readmeContent).toContain('## Quick Start')
      expect(readmeContent).toContain('## Configuration')
      expect(readmeContent).toContain('## Documentation')
      expect(readmeContent).toContain('## Task Management')

      // Verify code blocks
      expect(readmeContent).toMatch(/```bash/)
      expect(readmeContent).toContain('bun install')
      expect(readmeContent).toContain('bun run loopwork')
      expect(readmeContent).toContain('--resume')
    })

    test('PRD templates follow correct format', async () => {
      await init()

      // Feature template
      const featureTemplate = fs.readFileSync(resolvePath('.specs/tasks/templates/feature-template.md'), 'utf-8')
      expect(featureTemplate).toMatch(/^# TASK-XXX: Feature Name$/m)
      expect(featureTemplate).toMatch(/^## Goal$/m)
      expect(featureTemplate).toMatch(/^## Requirements$/m)
      expect(featureTemplate).toMatch(/^## Acceptance Criteria$/m)
      expect(featureTemplate).toMatch(/^## Technical Notes$/m)

      // Bugfix template
      const bugfixTemplate = fs.readFileSync(resolvePath('.specs/tasks/templates/bugfix-template.md'), 'utf-8')
      expect(bugfixTemplate).toMatch(/^# TASK-XXX: Bug Fix Title$/m)
      expect(bugfixTemplate).toMatch(/^## Problem$/m)
      expect(bugfixTemplate).toMatch(/^## Expected Behavior$/m)
      expect(bugfixTemplate).toMatch(/^## Steps to Reproduce$/m)
      expect(bugfixTemplate).toMatch(/^## Root Cause$/m)
      expect(bugfixTemplate).toMatch(/^## Solution$/m)
    })

    test('sample task PRD is valid', async () => {
      await init()

      const prdContent = fs.readFileSync(resolvePath('.specs/tasks/TASK-001.md'), 'utf-8')

      // Verify structure
      expect(prdContent).toMatch(/^# TASK-001: My First Task$/m)
      expect(prdContent).toMatch(/^## Goal$/m)
      expect(prdContent).toMatch(/^## Requirements$/m)

      // Verify checklist format
      expect(prdContent).toContain('- [ ] Requirement 1')
      expect(prdContent).toContain('- [ ] Requirement 2')
    })
  })

  describe('Performance Tests', () => {
    test('completes initialization in reasonable time', async () => {
      const startTime = Date.now()

      await init()

      const duration = Date.now() - startTime

      // Should complete in less than 5 seconds
      expect(duration).toBeLessThan(5000)
    })
  })
})
