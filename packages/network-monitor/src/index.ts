/**
 * Network Monitor for Loopwork
 *
 * Monitors internet connectivity and speed, preventing task execution when offline
 * and adjusting worker pools based on connection quality.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as dns from 'dns'

const execAsync = promisify(exec)
const dnsResolve = promisify(dns.resolve)

export type ConfigWrapper = (config: unknown) => unknown

export interface LoopworkPlugin {
  readonly name: string
  readonly classification?: 'critical' | 'enhancement'
  readonly essential?: boolean
  readonly requiresNetwork?: boolean
  onLoopStart?: (namespace: string) => void | Promise<void>
  onTaskStart?: (context: TaskContext) => void | Promise<void>
  onLoopEnd?: () => void | Promise<void>
}

export interface TaskContext {
  task: {
    id: string
    title: string
  }
  iteration: number
  startTime: Date
  namespace: string
}

// ============================================================================
// Types
// ============================================================================

export interface NetworkMonitorConfig {
  enabled?: boolean
  
  /** Check interval in ms (default: 30000 = 30s) */
  checkInterval?: number
  
  /** Timeout for connectivity checks in ms (default: 5000 = 5s) */
  checkTimeout?: number
  
  /** URLs to test connectivity (default: ['1.1.1.1', '8.8.8.8']) */
  testHosts?: string[]
  
  /** Speed thresholds in Mbps */
  speedThresholds?: {
    /** Minimum speed to run tasks (default: 1 Mbps) */
    minimum: number
    /** Good speed threshold (default: 10 Mbps) */
    good: number
    /** Excellent speed threshold (default: 50 Mbps) */
    excellent: number
  }
  
  /** Worker pool adjustment based on speed */
  adjustWorkerPool?: boolean
  
  /** Prevent new task execution when offline (default: true) */
  blockWhenOffline?: boolean
  
  /** Retry delay when offline (ms, default: 60000 = 1 min) */
  offlineRetryDelay?: number
}

export type ConnectionQuality = 'offline' | 'poor' | 'fair' | 'good' | 'excellent'

export interface NetworkStatus {
  online: boolean
  quality: ConnectionQuality
  downloadSpeed?: number  // Mbps
  uploadSpeed?: number    // Mbps
  latency?: number        // ms
  lastCheck: Date
  recommendedWorkers: number
}

export interface SpeedTestResult {
  downloadSpeed: number  // Mbps
  uploadSpeed: number    // Mbps
  latency: number        // ms
  server?: string
}

// ============================================================================
// Network Monitor Class
// ============================================================================

export class NetworkMonitor {
  private config: Required<NetworkMonitorConfig>
  private status: NetworkStatus
  private checkTimer?: NodeJS.Timeout
  private listeners: ((status: NetworkStatus) => void)[] = []
  private checking = false

  constructor(config: NetworkMonitorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      checkInterval: config.checkInterval ?? 30000,
      checkTimeout: config.checkTimeout ?? 5000,
      testHosts: config.testHosts ?? ['1.1.1.1', '8.8.8.8', 'dns.google'],
      speedThresholds: config.speedThresholds ?? {
        minimum: 1,
        good: 10,
        excellent: 50,
      },
      adjustWorkerPool: config.adjustWorkerPool ?? true,
      blockWhenOffline: config.blockWhenOffline ?? true,
      offlineRetryDelay: config.offlineRetryDelay ?? 60000,
    }

    this.status = {
      online: true,
      quality: 'good',
      recommendedWorkers: 5,
      lastCheck: new Date(),
    }
  }

  /**
   * Start monitoring network connectivity
   */
  start(): void {
    if (!this.config.enabled) return

    // Initial check
    this.checkConnectivity()

    // Periodic checks
    this.checkTimer = setInterval(() => {
      this.checkConnectivity()
    }, this.config.checkInterval)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = undefined
    }
  }

  /**
   * Get current network status
   */
  getStatus(): NetworkStatus {
    return { ...this.status }
  }

  /**
   * Check if network is online
   */
  isOnline(): boolean {
    return this.status.online
  }

  /**
   * Get recommended worker pool size based on connection quality
   */
  getRecommendedWorkers(maxWorkers = 5): number {
    if (!this.status.online) return 0
    return Math.min(this.status.recommendedWorkers, maxWorkers)
  }

  /**
   * Register listener for status changes
   */
  onChange(listener: (status: NetworkStatus) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Remove listener
   */
  offChange(listener: (status: NetworkStatus) => void): void {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  /**
   * Check network connectivity
   */
  private async checkConnectivity(): Promise<void> {
    if (this.checking) return
    this.checking = true

    try {
      const online = await this.testConnectivity()
      
      if (online) {
        // If online, try to measure speed
        const speedTest = await this.measureSpeed()
        
        this.status = {
          online: true,
          quality: this.determineQuality(speedTest?.downloadSpeed),
          downloadSpeed: speedTest?.downloadSpeed,
          uploadSpeed: speedTest?.uploadSpeed,
          latency: speedTest?.latency,
          recommendedWorkers: this.calculateWorkers(speedTest?.downloadSpeed),
          lastCheck: new Date(),
        }
      } else {
        this.status = {
          online: false,
          quality: 'offline',
          recommendedWorkers: 0,
          lastCheck: new Date(),
        }
      }

      // Notify listeners
      this.notifyListeners()
    } catch (error) {
      console.error('Network check failed:', error)
    } finally {
      this.checking = false
    }
  }

  /**
   * Test basic connectivity using DNS lookup
   */
  private async testConnectivity(): Promise<boolean> {
    const promises = this.config.testHosts.map(async (host) => {
      try {
        await dnsResolve(host)
        return true
      } catch {
        return false
      }
    })

    const results = await Promise.all(promises)
    // Consider online if at least one host is reachable
    return results.some(r => r)
  }

  /**
   * Measure network speed
   * Uses a lightweight HTTP-based speed test
   */
  private async measureSpeed(): Promise<SpeedTestResult | null> {
    try {
      const start = Date.now()
      
      // Download test: fetch a small file from Cloudflare
      const downloadUrl = 'https://speed.cloudflare.com/__down?bytes=1000000' // 1MB
      const downloadStart = Date.now()
      
      const response = await fetch(downloadUrl, {
        signal: AbortSignal.timeout(this.config.checkTimeout)
      })
      
      if (!response.ok) return null
      
      await response.arrayBuffer()
      const downloadTime = (Date.now() - downloadStart) / 1000 // seconds
      const downloadSpeed = (1 * 8) / downloadTime // Mbps (1MB = 8Mb)

      // Latency test: measure DNS + connection time
      const latencyStart = Date.now()
      await fetch('https://1.1.1.1', { 
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.checkTimeout)
      })
      const latency = Date.now() - latencyStart

      return {
        downloadSpeed,
        uploadSpeed: 0, // Upload test would require POST, skip for now
        latency,
        server: 'cloudflare',
      }
    } catch {
      // If speed test fails, assume poor connection
      return {
        downloadSpeed: 0.5,
        uploadSpeed: 0.5,
        latency: 1000,
      }
    }
  }

  /**
   * Determine connection quality based on speed
   */
  private determineQuality(downloadSpeed?: number): ConnectionQuality {
    if (!downloadSpeed) return 'fair'
    
    const { minimum, good, excellent } = this.config.speedThresholds
    
    if (downloadSpeed < minimum) return 'poor'
    if (downloadSpeed < good) return 'fair'
    if (downloadSpeed < excellent) return 'good'
    return 'excellent'
  }

  /**
   * Calculate recommended workers based on download speed
   */
  private calculateWorkers(downloadSpeed?: number): number {
    if (!downloadSpeed) return 2
    
    const { minimum, good, excellent } = this.config.speedThresholds
    
    if (downloadSpeed < minimum) return 1        // Very slow: 1 worker
    if (downloadSpeed < good) return 2           // Fair: 2 workers
    if (downloadSpeed < excellent) return 3      // Good: 3 workers
    return 5                                     // Excellent: 5 workers
  }

  /**
   * Notify all listeners of status change
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.status)
      } catch (error) {
        console.error('Network monitor listener error:', error)
      }
    }
  }
}

// ============================================================================
// Loopwork Plugin
// ============================================================================

/**
 * Create network monitoring plugin
 */
export function createNetworkMonitorPlugin(
  config: NetworkMonitorConfig = {}
): LoopworkPlugin {
  const monitor = new NetworkMonitor(config)
  let taskBlockedLogged = false

  return {
    name: 'network-monitor',
    classification: 'critical',
    requiresNetwork: false, // This plugin monitors network, doesn't require it

    async onLoopStart() {
      if (!config.enabled) return
      
      monitor.start()
      console.log('🌐 Network monitor started')
      
      // Log initial status
      const status = monitor.getStatus()
      console.log(`   Connection: ${status.quality}`)
      if (status.downloadSpeed) {
        console.log(`   Speed: ${status.downloadSpeed.toFixed(1)} Mbps down`)
      }
      console.log(`   Recommended workers: ${status.recommendedWorkers}`)

      // Listen for status changes
      monitor.onChange((newStatus) => {
        if (!newStatus.online) {
          console.warn('⚠️  Internet connection lost - pausing task execution')
        } else if (newStatus.quality === 'poor') {
          console.warn(`⚠️  Slow connection detected (${newStatus.downloadSpeed?.toFixed(1)} Mbps) - limiting workers to ${newStatus.recommendedWorkers}`)
        } else {
          console.log(`✅ Connection restored: ${newStatus.quality} (${newStatus.downloadSpeed?.toFixed(1)} Mbps)`)
        }
      })
    },

    async onTaskStart(context: TaskContext) {
      if (!config.enabled) return

      const status = monitor.getStatus()

      // Block task execution if offline
      if (config.blockWhenOffline && !status.online) {
        if (!taskBlockedLogged) {
          console.error('❌ Cannot start task: No internet connection')
          console.log(`   Waiting for connection... (will retry every ${(config.offlineRetryDelay || 60000) / 1000}s)`)
          taskBlockedLogged = true
        }
        
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, config.offlineRetryDelay || 60000))
        
        // Recheck
        const newStatus = monitor.getStatus()
        if (!newStatus.online) {
          throw new Error('Task blocked: No internet connection')
        } else {
          console.log('✅ Connection restored - resuming task execution')
          taskBlockedLogged = false
        }
      }

      // Warn if connection is poor
      if (status.quality === 'poor') {
        console.warn(`⚠️  Starting task with poor connection (${status.downloadSpeed?.toFixed(1)} Mbps)`)
        console.warn('   Task may be slow or fail. Consider waiting for better connection.')
      }
    },

    async onLoopEnd() {
      monitor.stop()
      console.log('🌐 Network monitor stopped')
    },
  }
}

/**
 * Config wrapper for network monitoring
 */
export function withNetworkMonitor(config: NetworkMonitorConfig = {}): ConfigWrapper {
  return (baseConfig) => {
    const currentConfig = baseConfig as any
    const monitor = new NetworkMonitor(config)
    
    // Start monitoring immediately to get initial status
    monitor.start()
    const status = monitor.getStatus()
    
    // Adjust parallel workers based on connection
    let adjustedParallel = currentConfig.parallel || 1
    if (config.adjustWorkerPool && status.online) {
      const recommended = monitor.getRecommendedWorkers(currentConfig.parallel || 5)
      adjustedParallel = recommended
      
      if (recommended < (currentConfig.parallel || 5)) {
        console.log(`🌐 Adjusting worker pool: ${currentConfig.parallel || 5} → ${recommended} (based on connection: ${status.quality})`)
      }
    }
    
    monitor.stop() // Stop initial monitor, will restart in plugin

    return {
      ...currentConfig,
      parallel: adjustedParallel,
      plugins: [
        ...(currentConfig.plugins || []),
        createNetworkMonitorPlugin(config),
      ],
      networkMonitor: {
        enabled: true,
        ...config,
      },
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export default {
  NetworkMonitor,
  createNetworkMonitorPlugin,
  withNetworkMonitor,
}
