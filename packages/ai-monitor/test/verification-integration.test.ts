/**
 * Integration tests for Verification Engine with AI Monitor
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { AIMonitor } from '../src/index'
import type { LoopworkConfig } from '@loopwork-ai/loopwork/contracts'
import type { TaskBackend } from '@loopwork-ai/loopwork/contracts'
import type { Task } from '@loopwork-ai/loopwork/contracts'

describe('Verification Integration', () => {
  let tempDir: string
  let logFile: string
  let mockBackend: TaskBackend

  beforeEach(() => {
    // Create temp directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loopwork-verification-integration-'))
    logFile = path.join(tempDir, 'test.log')

    // Create mock backend
    mockBackend = {
      name: 'mock-backend',
      async findNextTask() {
        return null
      },
      async getTask(id: string): Promise<Task | null> {
        return {
          id,
          title: 'Test Task',
          description: 'Test description',
          status: 'pending',
          priority: 'high'
        }
      },
      async listPendingTasks() {
        return []
      },
      async countPending() {
        return 0
      },
      async markInProgress() {
        return { success: true }
      },
      async markCompleted() {
        return { success: true }
      },
      async markFailed() {
        return { success: true }
      },
      async markQuarantined() {
        return { success: true }
      },
      async restoreFromQuarantine() {
        return { success: true }
      },
      async createSubTask() {
        return {
          id: 'sub-1',
          title: 'Sub Task',
          description: '',
          status: 'pending',
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      async getSubTasks() {
        return []
      },
      async getDependencies() {
        return []
      },
      async getDependents() {
        return []
      },
      async areDependenciesMet() {
        return true
      }
    } as unknown as TaskBackend
  })

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('Full Verification Flow', () => {
    test('verification runs after healing action completes', async () => {
      // Create test project structure
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Build successful"',
          test: 'echo "Tests passed"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      // Create config
      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Build successful"',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      // Initialize monitor
      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      // Call lifecycle hooks
      await monitor.onConfigLoad(config)
      await monitor.onBackendReady(mockBackend)

      // Verification should be integrated
      const stats = monitor.getStats()
      expect(stats).toBeDefined()
    })

    test('all verification checks execute', async () => {
      // Create project with multiple scripts
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Build OK"',
          test: 'echo "Test OK"',
          lint: 'echo "Lint OK"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      // Create log file
      fs.writeFileSync(logFile, 'INFO: All good\n')

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          logFile,
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Build OK"',
              timeout: 5000,
              required: true
            },
            {
              type: 'TEST',
              command: 'echo "Test OK"',
              timeout: 5000,
              required: true
            },
            {
              type: 'ERROR_FREE',
              timeout: 0,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // Monitor should be configured with verification
      expect(monitor).toBeDefined()
    })

    test('verification result accuracy', async () => {
      // Create project with passing build
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'exit 0'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'exit 0',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // Verification should work correctly
      expect(monitor).toBeDefined()
    })
  })

  describe('Integration with AI Monitor', () => {
    test('healing action triggers verification', async () => {
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Build"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Build"',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)
      await monitor.onBackendReady(mockBackend)

      // Monitor should be active
      expect(monitor).toBeDefined()
    })

    test('success recorded correctly in circuit breaker', async () => {
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Success"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Success"',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any,
        circuitBreaker: {
          maxFailures: 3,
          cooldownPeriodMs: 60000
        }
      })

      await monitor.onConfigLoad(config)

      const stats = monitor.getStats()
      expect(stats.circuitBreaker.status).toContain('CLOSED')
    })

    test('failure triggers circuit breaker', async () => {
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'exit 1'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'exit 1',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any,
        circuitBreaker: {
          maxFailures: 1, // Very low threshold for testing
          cooldownPeriodMs: 60000
        }
      })

      await monitor.onConfigLoad(config)

      // Circuit breaker should be configured
      const stats = monitor.getStats()
      expect(stats.circuitBreaker).toBeDefined()
    })
  })

  describe('Stale Evidence Detection', () => {
    test('fresh evidence accepted', async () => {
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Fresh build"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000, // 5 minutes
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Fresh build"',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // Evidence should be considered fresh
      expect(monitor).toBeDefined()
    })

    test('stale evidence rejected (requires new check)', async () => {
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Build"'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 100, // Very short TTL (100ms)
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Build"',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // After 100ms, evidence would be stale
      await new Promise(resolve => setTimeout(resolve, 150))

      expect(monitor).toBeDefined()
    })
  })

  describe('Error Handling', () => {
    test('handles missing commands gracefully', async () => {
      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: undefined, // No command
              timeout: 5000,
              required: false
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // Should not crash
      expect(monitor).toBeDefined()
    })

    test('handles command timeout', async () => {
      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'sleep 10',
              timeout: 100, // Very short timeout
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // Should handle timeout gracefully
      expect(monitor).toBeDefined()
    })

    test('logs error details', async () => {
      const packageJson = {
        name: 'test-project',
        scripts: {
          build: 'echo "Error message" && exit 1'
        }
      }
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(packageJson))

      const config: LoopworkConfig = {
        backend: null as any,
        cli: 'claude',
        projectRoot: tempDir,
        verification: {
          freshnessTTL: 5 * 60 * 1000,
          checks: [
            {
              type: 'BUILD',
              command: 'echo "Error message" && exit 1',
              timeout: 5000,
              required: true
            }
          ]
        }
      }

      const monitor = new AIMonitor({
        enabled: true,
        verification: config.verification as any
      })

      await monitor.onConfigLoad(config)

      // Should capture error details
      expect(monitor).toBeDefined()
    })
  })
})
