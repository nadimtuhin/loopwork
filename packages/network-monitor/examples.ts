/**
 * Network Monitor Plugin - Usage Examples
 */

import { withNetworkMonitor, NetworkMonitor } from '@loopwork-ai/network-monitor'
import { compose, defineConfig } from '@loopwork-ai/loopwork'
import { withJSONBackend } from '@loopwork-ai/loopwork/backends'

// Example 1: Basic Setup with Default Settings
export const basicConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
  })
)(defineConfig({
  parallel: 5,
  maxIterations: 50,
}))

// Example 2: Conservative Mode for Slow Connections
export const conservativeConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
    speedThresholds: {
      minimum: 0.5,  // Allow very slow connections
      good: 5,       // Lower bar for "good"
      excellent: 25, // Lower bar for "excellent"
    },
    checkInterval: 60000, // Check less frequently
    adjustWorkerPool: true,
  })
)(defineConfig({
  parallel: 3,
  maxIterations: 50,
}))

// Example 3: Aggressive Mode for Fast Connections
export const aggressiveConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
    speedThresholds: {
      minimum: 5,    // Require faster minimum
      good: 25,      // Higher bar for "good"
      excellent: 100, // Much higher for "excellent"
    },
    checkInterval: 120000, // Check every 2 minutes
    blockWhenOffline: true,
    adjustWorkerPool: true,
  })
)(defineConfig({
  parallel: 10,
  maxIterations: 100,
}))

// Example 4: Standalone NetworkMonitor Usage
export function standaloneExample() {
  const monitor = new NetworkMonitor({
    enabled: true,
    checkInterval: 30000,
    speedThresholds: {
      minimum: 1,
      good: 10,
      excellent: 50,
    },
  })

  monitor.start()

  monitor.onChange((status) => {
    console.log('Network status changed:')
    console.log(`  Online: ${status.online}`)
    console.log(`  Quality: ${status.quality}`)
    console.log(`  Speed: ${status.downloadSpeed?.toFixed(1)} Mbps`)
    console.log(`  Recommended workers: ${status.recommendedWorkers}`)
  })

  const status = monitor.getStatus()
  console.log('Current status:', status)

  const recommendedWorkers = monitor.getRecommendedWorkers(5)
  console.log(`Recommended workers (max 5): ${recommendedWorkers}`)

  setTimeout(() => {
    monitor.stop()
    console.log('Monitor stopped')
  }, 60000)
}

// Example 5: Custom Configuration with All Options
export const fullConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
    checkInterval: 30000,
    checkTimeout: 5000,
    testHosts: ['1.1.1.1', '8.8.8.8', 'dns.google', '9.9.9.9'],
    speedThresholds: {
      minimum: 1,
      good: 10,
      excellent: 50,
    },
    adjustWorkerPool: true,
    blockWhenOffline: true,
    offlineRetryDelay: 60000,
  })
)(defineConfig({
  parallel: 5,
  maxIterations: 50,
  timeout: 600,
}))

// Example 6: Monitoring Only (No Blocking)
export const monitorOnlyConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
    blockWhenOffline: false, // Don't block, just monitor
    adjustWorkerPool: false,  // Don't adjust workers
  })
)(defineConfig({
  parallel: 5,
  maxIterations: 50,
}))

// Example 7: Development Mode (Lenient)
export const devConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
    speedThresholds: {
      minimum: 0.1,  // Very lenient
      good: 2,
      excellent: 10,
    },
    blockWhenOffline: false,  // Don't block in dev
    adjustWorkerPool: true,
    checkInterval: 60000,     // Less frequent checks
  })
)(defineConfig({
  parallel: 2,
  maxIterations: 20,
}))

// Example 8: Production Mode (Strict)
export const prodConfig = compose(
  withJSONBackend({ tasksFile: '.specs/tasks/tasks.json' }),
  withNetworkMonitor({
    enabled: true,
    speedThresholds: {
      minimum: 2,    // Require decent speed
      good: 15,
      excellent: 75,
    },
    blockWhenOffline: true,   // Always block when offline
    adjustWorkerPool: true,
    checkInterval: 30000,     // Frequent checks
    offlineRetryDelay: 30000, // Retry faster in production
  })
)(defineConfig({
  parallel: 10,
  maxIterations: 100,
}))
