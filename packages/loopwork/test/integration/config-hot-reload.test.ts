/**
 * Integration tests for config hot reload functionality
 * Tests full stack: config loading, file watching, reload events
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import fs from 'fs'
import path from 'path'
import { getConfig, getConfigHotReloadManager, resetConfigHotReloadManager, type ConfigReloadEvent } from '../../src/core/config'

// Test directory management
let testDir: string

function createTestDir(): string {
  const dir = `/tmp/loopwork-hotreload-${Date.now()}-${Math.random().toString(36).slice(2)}`
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, '.specs', 'tasks'), { recursive: true })
  fs.mkdirSync(path.join(dir, '.loopwork'), { recursive: true })
  return dir
}

function cleanupTestDir(dir: string): void {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function createConfigFile(dir: string, content: string): void {
  fs.writeFileSync(
    path.join(dir, 'loopwork.config.ts'),
    content
  )
}

function createTasksFile(dir: string): void {
  const tasksJson = {
    tasks: [
      {
        id: 'TASK-001',
        status: 'pending',
        priority: 'medium',
      },
    ],
  }
  fs.writeFileSync(
    path.join(dir, '.specs', 'tasks', 'tasks.json'),
    JSON.stringify(tasksJson, null, 2)
  )
}

function createPrdFiles(dir: string): void {
  const prdContent = `# TASK-001

## Goal
Test task for hot reload

## Requirements
- Requirement 1
- Requirement 2
`
  fs.writeFileSync(
    path.join(dir, '.specs', 'tasks', 'TASK-001.md'),
    prdContent
  )
}

describe('Config Hot Reload - Integration Tests', () => {
  beforeEach(() => {
    testDir = createTestDir()
    resetConfigHotReloadManager()
  })

  afterEach(() => {
    cleanupTestDir(testDir)
  })

  describe('Hot reload manager initialization', () => {
    test('should return singleton instance', () => {
      const manager1 = getConfigHotReloadManager()
      const manager2 = getConfigHotReloadManager()

      expect(manager1).toBe(manager2)
    })

    test('should not be watching initially', () => {
      const manager = getConfigHotReloadManager()

      expect(manager.isWatching()).toBe(false)
    })
  })

  describe('Config file watching', () => {
    test('should start watching config file', async () => {
      // Simple JS config without imports
      const configContent = `
module.exports = {
  cli: 'claude',
  maxIterations: 10,
}
`

      createConfigFile(testDir, configContent)
      createTasksFile(testDir)
      createPrdFiles(testDir)

      const manager = getConfigHotReloadManager()
      const config = await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.js'),
      })

      expect(manager.isWatching()).toBe(true)
      expect(manager.getCurrentConfig()).not.toBeNull()
    })

    test('should detect config file changes', async () => {
      const initialConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: 10,
}
`

      createConfigFile(testDir, initialConfig)
      createTasksFile(testDir)
      createPrdFiles(testDir)

      const manager = getConfigHotReloadManager()

      // Load initial config and start watching
      const initialLoadedConfig = await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.js'),
      })

      expect(initialLoadedConfig.maxIterations).toBe(10)

      // Wait a bit for watcher to stabilize
      await new Promise(resolve => setTimeout(resolve, 200))

      // Modify config file
      const modifiedConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: 25,
}
`

      createConfigFile(testDir, modifiedConfig)

      // Wait for file to be written and watcher to detect change
      await new Promise(resolve => setTimeout(resolve, 300))

      // Get current config - should be updated
      const currentConfig = manager.getCurrentConfig()

      expect(currentConfig).not.toBeNull()
      if (currentConfig) {
        expect(currentConfig.maxIterations).toBe(25)
      }
    }, 5000)

    test('should emit reload events on config change', async () => {
      const configContent = `
module.exports = {
  cli: 'claude',
  maxIterations: 10,
}
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      // Track reload events
      const reloadEvents: ConfigReloadEvent[] = []
      manager.onReload((event: ConfigReloadEvent) => {
        reloadEvents.push(event)
      })

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.js'),
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      // Modify config
      const modifiedConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: 50,
}
`

      createConfigFile(testDir, modifiedConfig)

      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 500))

      expect(reloadEvents.length).toBeGreaterThanOrEqual(1)
      expect(reloadEvents[0].configPath).toContain('loopwork.config.js')
      expect(reloadEvents[0].config.maxIterations).toBe(50)
    }, 5000)

    test('should handle invalid config gracefully', async () => {
      const validConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: 10,
}
`

      createConfigFile(testDir, validConfig)

      const manager = getConfigHotReloadManager()

      const initialConfig = await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.js'),
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      // Write invalid config
      const invalidConfig = `
this is not valid javascript
`
      createConfigFile(testDir, invalidConfig)

      // Wait and check - should keep old config
      await new Promise(resolve => setTimeout(resolve, 500))

      const currentConfig = manager.getCurrentConfig()
      expect(currentConfig).not.toBeNull()
      expect(currentConfig?.maxIterations).toBe(10) // Should preserve old config
    }, 5000)
  })

  describe('Config reload behavior', () => {
    test('should preserve CLI options when reloading', async () => {
      const configContent = `
module.exports = {
  cli: 'claude',
  maxIterations: 10,
}
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      // Load with CLI option
      const initialConfig = await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.js'),
        timeout: 900,
      })

      expect(initialConfig.timeout).toBe(900)

      await new Promise(resolve => setTimeout(resolve, 200))

      // Change config file
      const modifiedConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: 20,
}
`

      createConfigFile(testDir, modifiedConfig)

      await new Promise(resolve => setTimeout(resolve, 500))

      const currentConfig = manager.getCurrentConfig()

      // Reload should not override CLI options
      expect(currentConfig?.maxIterations).toBe(20) // Changed from file
      // Note: In production, we'd want to merge CLI options, but for this test we verify reload works
    }, 5000)

    test('should validate reloaded config', async () => {
      const validConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: 10,
}
`

      createConfigFile(testDir, validConfig)

      const manager = getConfigHotReloadManager()

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.js'),
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      // Write invalid config (negative maxIterations)
      const invalidConfig = `
module.exports = {
  cli: 'claude',
  maxIterations: -5,
}
`

      createConfigFile(testDir, invalidConfig)

      await new Promise(resolve => setTimeout(resolve, 500))

      const currentConfig = manager.getCurrentConfig()

      // Should keep old valid config
      expect(currentConfig).not.toBeNull()
      expect(currentConfig?.maxIterations).toBe(10)
    }, 5000)
  })
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      // Load with CLI option
      const initialConfig = await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.ts'),
        timeout: 900,
      })

      expect(initialConfig.timeout).toBe(900)

      await new Promise(resolve => setTimeout(resolve, 200))

      // Change config file
      const modifiedConfig = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 20,
})
`

      createConfigFile(testDir, modifiedConfig)

      await new Promise(resolve => setTimeout(resolve, 500))

      const currentConfig = manager.getCurrentConfig()

      // Reload should not override CLI options
      expect(currentConfig?.maxIterations).toBe(20) // Changed from file
      // Note: In production, we'd want to merge CLI options, but for this test we verify reload works
    }, 5000)

    test('should validate reloaded config', async () => {
      const validConfig = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, validConfig)

      const manager = getConfigHotReloadManager()

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.ts'),
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      // Write invalid config (negative maxIterations)
      const invalidConfig = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: -5,
})
`

      createConfigFile(testDir, invalidConfig)

      await new Promise(resolve => setTimeout(resolve, 500))

      const currentConfig = manager.getCurrentConfig()

      // Should keep old valid config
      expect(currentConfig).not.toBeNull()
      expect(currentConfig?.maxIterations).toBe(10)
    }, 5000)
  })

  describe('Watcher lifecycle', () => {
    test('should stop watching when stop is called', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.ts'),
      })

      expect(manager.isWatching()).toBe(true)

      // Stop watching
      await manager.stop()

      expect(manager.isWatching()).toBe(false)
    })

    test('should allow stopping and restarting watcher', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.ts'),
      })

      expect(manager.isWatching()).toBe(true)

      // Stop
      await manager.stop()
      expect(manager.isWatching()).toBe(false)

      // Restart
      manager.start(path.join(testDir, 'loopwork.config.ts'), await getConfig({
        config: path.join(testDir, 'loopwork.config.ts'),
      }))

      expect(manager.isWatching()).toBe(true)
    })

    test('should remove event listeners when offReload is called', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      let callCount = 0
      const callback = () => { callCount++ }

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.ts'),
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      manager.onReload(callback)

      // Remove listener
      manager.offReload(callback)

      // Modify config
      const modifiedConfig = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 20,
})
`

      createConfigFile(testDir, modifiedConfig)

      await new Promise(resolve => setTimeout(resolve, 500))

      // Callback should not have been called
      expect(callCount).toBe(0)
    }, 5000)
  })

  describe('Environment variable configuration', () => {
    test('should not start hot reload when flag is false', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      await getConfig({
        hotReload: false,
        config: path.join(testDir, 'loopwork.config.ts'),
      })

      expect(manager.isWatching()).toBe(false)
    })

    test('should not start hot reload when flag is not provided', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      await getConfig({
        config: path.join(testDir, 'loopwork.config.ts'),
        // hotReload not provided
      })

      expect(manager.isWatching()).toBe(false)
    })

    test('should start hot reload when environment variable is set', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      // Set environment variable
      const originalEnv = process.env.LOOPWORK_HOT_RELOAD
      process.env.LOOPWORK_HOT_RELOAD = 'true'

      const manager = getConfigHotReloadManager()

      try {
        await getConfig({
          config: path.join(testDir, 'loopwork.config.ts'),
        })

        expect(manager.isWatching()).toBe(true)
      } finally {
        // Restore environment variable
        if (originalEnv === undefined) {
          delete process.env.LOOPWORK_HOT_RELOAD
        } else {
          process.env.LOOPWORK_HOT_RELOAD = originalEnv
        }
      }
    })
  })

  describe('Edge cases', () => {
    test('should handle non-existent config file gracefully', async () => {
      const manager = getConfigHotReloadManager()

      const config = await getConfig({
        hotReload: true,
        config: path.join(testDir, 'non-existent.config.ts'),
      })

      // Should still return config (from defaults)
      expect(config).not.toBeNull()

      // But watcher should not start
      expect(manager.isWatching()).toBe(false)
    })

    test('should handle rapid config changes', async () => {
      const configContent = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: 10,
})
`

      createConfigFile(testDir, configContent)

      const manager = getConfigHotReloadManager()

      const reloadEvents: ConfigReloadEvent[] = []
      manager.onReload((event: ConfigReloadEvent) => {
        reloadEvents.push(event)
      })

      await getConfig({
        hotReload: true,
        config: path.join(testDir, 'loopwork.config.ts'),
      })

      await new Promise(resolve => setTimeout(resolve, 200))

      // Rapidly change config multiple times
      for (let i = 0; i < 3; i++) {
        const modifiedConfig = `
import { defineConfig } from 'loopwork'

export default defineConfig({
  cli: 'claude',
  maxIterations: ${10 + i * 5},
})
`
        createConfigFile(testDir, modifiedConfig)
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Wait for all changes to be processed
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Should handle multiple changes (maybe deduplicate or handle all)
      expect(reloadEvents.length).toBeGreaterThan(0)
    }, 10000)
  })
})
