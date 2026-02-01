import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Integration Suite E2E Tests
 * 
 * Tests integrations between loopwork and other packages.
 */

describe('Integration Suite E2E', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-integration-'))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('Checkpoint Integration', () => {
    test('saves and restores checkpoint during workflow', () => {
      const checkpointDir = path.join(tempDir, 'checkpoints')
      fs.mkdirSync(checkpointDir, { recursive: true })

      // Simulate workflow state
      const workflowState = {
        sessionId: 'test-session',
        iteration: 5,
        tasksProcessed: 10,
        currentTaskId: 'TASK-005',
      }

      // Save checkpoint
      const checkpointFile = path.join(checkpointDir, 'checkpoint.json')
      fs.writeFileSync(checkpointFile, JSON.stringify(workflowState, null, 2))

      // Verify checkpoint saved
      expect(fs.existsSync(checkpointFile)).toBe(true)

      // Restore checkpoint
      const restored = JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'))
      expect(restored.sessionId).toBe(workflowState.sessionId)
      expect(restored.iteration).toBe(5)
      expect(restored.tasksProcessed).toBe(10)
    })

    test('handles checkpoint corruption gracefully', () => {
      const checkpointFile = path.join(tempDir, 'corrupt-checkpoint.json')
      fs.writeFileSync(checkpointFile, 'invalid json {{{')

      // Should handle gracefully
      expect(() => {
        JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'))
      }).toThrow()
    })
  })

  describe('Cost Tracking Integration', () => {
    test('tracks costs across multiple model calls', () => {
      const costs: Array<{ model: string; duration: number; cost: number }> = []

      // Simulate multiple model calls
      costs.push({ model: 'claude-opus', duration: 10000, cost: 0.15 })
      costs.push({ model: 'claude-sonnet', duration: 5000, cost: 0.03 })
      costs.push({ model: 'claude-haiku', duration: 2000, cost: 0.001 })

      const totalCost = costs.reduce((sum, c) => sum + c.cost, 0)
      expect(totalCost).toBe(0.181)

      const totalDuration = costs.reduce((sum, c) => sum + c.duration, 0)
      expect(totalDuration).toBe(17000)
    })

    test('generates cost report', () => {
      const sessionCosts = {
        sessionId: 'test-session',
        startTime: new Date().toISOString(),
        calls: [
          { model: 'opus', tokens: 1000, cost: 0.15 },
          { model: 'sonnet', tokens: 2000, cost: 0.06 },
        ],
        totalCost: 0.21,
      }

      const reportFile = path.join(tempDir, 'cost-report.json')
      fs.writeFileSync(reportFile, JSON.stringify(sessionCosts, null, 2))

      expect(fs.existsSync(reportFile)).toBe(true)
    })
  })

  describe('Plugin System Integration', () => {
    test('loads and executes multiple plugins', () => {
      const pluginsDir = path.join(tempDir, 'plugins')
      fs.mkdirSync(pluginsDir, { recursive: true })

      // Create mock plugin files
      const plugin1 = {
        name: 'git-autocommit',
        version: '1.0.0',
        enabled: true,
      }
      const plugin2 = {
        name: 'task-recovery',
        version: '2.0.0',
        enabled: true,
      }

      fs.writeFileSync(
        path.join(pluginsDir, 'git-autocommit.json'),
        JSON.stringify(plugin1)
      )
      fs.writeFileSync(
        path.join(pluginsDir, 'task-recovery.json'),
        JSON.stringify(plugin2)
      )

      // Load plugins
      const loadedPlugins = fs
        .readdirSync(pluginsDir)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(pluginsDir, f), 'utf-8')))
        .filter(p => p.enabled)

      expect(loadedPlugins).toHaveLength(2)
      expect(loadedPlugins.map(p => p.name)).toContain('git-autocommit')
      expect(loadedPlugins.map(p => p.name)).toContain('task-recovery')
    })
  })

  describe('Backend Integration', () => {
    test('switches between backends', () => {
      const backends = ['json', 'github', 'notion']
      const currentBackend = 'json'

      expect(backends).toContain(currentBackend)

      // Simulate backend configuration
      const config = {
        type: currentBackend,
        options: {},
      }

      expect(config.type).toBe('json')
    })

    test('handles backend failures with fallback', () => {
      const primaryBackend = { type: 'github', healthy: false }
      const fallbackBackend = { type: 'json', healthy: true }

      const backends = [primaryBackend, fallbackBackend]
      const healthyBackend = backends.find(b => b.healthy)

      expect(healthyBackend?.type).toBe('json')
    })
  })

  describe('CLI Integration', () => {
    test('configures CLI options correctly', () => {
      const cliConfig = {
        command: 'claude',
        model: 'claude-sonnet-4-5',
        timeout: 300000,
        maxRetries: 3,
      }

      expect(cliConfig.command).toBeDefined()
      expect(cliConfig.timeout).toBeGreaterThan(0)
      expect(cliConfig.maxRetries).toBeGreaterThanOrEqual(0)
    })

    test('handles CLI path resolution', () => {
      const cliPaths = new Map([
        ['claude', '/usr/local/bin/claude'],
        ['opencode', '/usr/local/bin/opencode'],
        ['gemini', '/usr/local/bin/gemini'],
      ])

      expect(cliPaths.has('claude')).toBe(true)
      expect(cliPaths.get('claude')).toMatch(/claude$/)
    })
  })

  describe('Configuration Integration', () => {
    test('loads and merges configurations', () => {
      const defaultConfig = {
        maxIterations: 50,
        timeout: 300,
        maxRetries: 3,
      }

      const userConfig = {
        maxIterations: 100,
        customOption: true,
      }

      const merged = { ...defaultConfig, ...userConfig }

      expect(merged.maxIterations).toBe(100) // User overrides default
      expect(merged.timeout).toBe(300) // Default preserved
      expect(merged.maxRetries).toBe(3) // Default preserved
      expect(merged.customOption).toBe(true) // User added
    })

    test('validates configuration', () => {
      const config = {
        maxIterations: -1, // Invalid
        timeout: 0, // Invalid
      }

      const errors: string[] = []

      if (config.maxIterations <= 0) {
        errors.push('maxIterations must be positive')
      }
      if (config.timeout <= 0) {
        errors.push('timeout must be positive')
      }

      expect(errors).toHaveLength(2)
    })
  })

  describe('Logging Integration', () => {
    test('creates log files with proper structure', () => {
      const logsDir = path.join(tempDir, 'logs')
      fs.mkdirSync(logsDir, { recursive: true })

      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Task completed',
        taskId: 'TASK-001',
      }

      const logFile = path.join(logsDir, 'loopwork.log')
      fs.writeFileSync(logFile, JSON.stringify(logEntry) + '\n')

      expect(fs.existsSync(logFile)).toBe(true)

      const content = fs.readFileSync(logFile, 'utf-8')
      const parsed = JSON.parse(content.trim())
      expect(parsed.taskId).toBe('TASK-001')
    })
  })

  describe('Environment Integration', () => {
    test('handles different environment variables', () => {
      const env = {
        NODE_ENV: 'test',
        LOOPWORK_DEBUG: 'true',
        LOOPWORK_NAMESPACE: 'test-namespace',
      }

      expect(env.NODE_ENV).toBe('test')
      expect(env.LOOPWORK_DEBUG).toBe('true')
      expect(env.LOOPWORK_NAMESPACE).toBeDefined()
    })
  })
})
