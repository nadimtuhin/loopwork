import os from 'os'
import { spawn } from 'child_process'
import type { LoopworkPlugin, LoopworkConfig, ConfigWrapper } from '@loopwork-ai/loopwork/contracts'

export interface SystemMonitoringOptions {
  enabled?: boolean
  intervalMs?: number
  cpuThresholdPercent?: number
  memoryThresholdPercent?: number
  warnOnHighUsage?: boolean
}

export interface ConnectivityMonitoringOptions {
  enabled?: boolean
  intervalMs?: number
  checkCliTools?: boolean
  cliTools?: string[]
  warnOnFailure?: boolean
  timeoutMs?: number
}

export interface QuotaMonitoringOptions {
  enabled?: boolean
  dailyRequestLimit?: number
  dailyTokenLimit?: number
  warnThresholdPercent?: number
  warnOnThreshold?: boolean
}

interface SystemStats {
  cpuLoad: number[]
  freeMem: number
  totalMem: number
  memUsagePercent: number
  uptime: number
}

interface ConnectivityStats {
  cliTools: Record<string, {
    available: boolean
    responsive: boolean
    lastCheck: Date
    responseTimeMs?: number
    error?: string
  }>
}

interface QuotaStats {
  requests: {
    count: number
    limit: number
    usagePercent: number
  }
  tokens: {
    count: number
    limit: number
    usagePercent: number
  }
  resetTime: Date
}

export class SystemResourceMonitor {
  private interval: Timer | null = null
  private options: Required<SystemMonitoringOptions>

  constructor(options: SystemMonitoringOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      intervalMs: options.intervalMs ?? 60000,
      cpuThresholdPercent: options.cpuThresholdPercent ?? 90,
      memoryThresholdPercent: options.memoryThresholdPercent ?? 90,
      warnOnHighUsage: options.warnOnHighUsage ?? true,
    }
  }

  start() {
    if (!this.options.enabled) return
    if (this.interval) clearInterval(this.interval)

    this.checkResources()
    this.interval = setInterval(() => this.checkResources(), this.options.intervalMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  getStats(): SystemStats {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const memUsagePercent = (usedMem / totalMem) * 100
    
    return {
      cpuLoad: os.loadavg(),
      freeMem,
      totalMem,
      memUsagePercent,
      uptime: os.uptime(),
    }
  }

  private checkResources() {
    const stats = this.getStats()
    const cpus = os.cpus().length
    
    // CPU Load (1 min avg) normalized by CPU count
    // loadavg returns [1min, 5min, 15min]
    const loadPercent = (stats.cpuLoad[0] / cpus) * 100

    if (this.options.warnOnHighUsage) {
      if (loadPercent > this.options.cpuThresholdPercent) {
        console.warn(`[SystemMonitor] ⚠️ High CPU Load: ${loadPercent.toFixed(1)}%`)
      }

      if (stats.memUsagePercent > this.options.memoryThresholdPercent) {
        console.warn(`[SystemMonitor] ⚠️ High Memory Usage: ${stats.memUsagePercent.toFixed(1)}% (${(stats.freeMem / 1024 / 1024).toFixed(0)}MB free)`)
      }
    }
  }
}

export function createSystemMonitoringPlugin(options: SystemMonitoringOptions = {}): LoopworkPlugin {
  const monitor = new SystemResourceMonitor(options)

  return {
    name: 'system-resource-monitor',
    
    onLoopStart: async () => {
      monitor.start()
    },

    onLoopEnd: async () => {
      monitor.stop()
      monitor.getStats()
    }
  }
}

export function withSystemMonitoring(options: SystemMonitoringOptions = {}): ConfigWrapper {
  return (config) => {
    const typedConfig = config as LoopworkConfig
    return {
      ...typedConfig,
      plugins: [
        ...(typedConfig.plugins || []),
        createSystemMonitoringPlugin(options)
      ]
    }
  }
}

// Connectivity Monitor
export class ConnectivityMonitor {
  private interval: Timer | null = null
  private options: Required<ConnectivityMonitoringOptions>
  private stats: ConnectivityStats = { cliTools: {} }

  constructor(options: ConnectivityMonitoringOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      intervalMs: options.intervalMs ?? 300000, // 5 minutes
      checkCliTools: options.checkCliTools ?? true,
      cliTools: options.cliTools ?? ['claude', 'opencode', 'gemini'],
      warnOnFailure: options.warnOnFailure ?? true,
      timeoutMs: options.timeoutMs ?? 10000,
    }
  }

  start() {
    if (!this.options.enabled) return
    if (this.interval) clearInterval(this.interval)

    this.checkConnectivity()
    this.interval = setInterval(() => this.checkConnectivity(), this.options.intervalMs)
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  getStats(): ConnectivityStats {
    return this.stats
  }

  private async checkConnectivity() {
    if (this.options.checkCliTools) {
      for (const tool of this.options.cliTools) {
        await this.checkCliTool(tool)
      }
    }
  }

  private async checkCliTool(tool: string): Promise<void> {
    const startTime = Date.now()
    
    try {
      const available = await this.checkToolAvailable(tool)
      
      if (!available) {
        this.stats.cliTools[tool] = {
          available: false,
          responsive: false,
          lastCheck: new Date(),
          error: 'CLI tool not found in PATH'
        }
        
        if (this.options.warnOnFailure) {
          console.warn(`[ConnectivityMonitor] ⚠️ ${tool} CLI not available`)
        }
        return
      }

      const responsive = await this.checkToolResponsive(tool)
      const responseTimeMs = Date.now() - startTime

      this.stats.cliTools[tool] = {
        available: true,
        responsive,
        lastCheck: new Date(),
        responseTimeMs,
        error: responsive ? undefined : 'CLI tool not responding'
      }

      if (!responsive && this.options.warnOnFailure) {
        console.warn(`[ConnectivityMonitor] ⚠️ ${tool} CLI not responding (${responseTimeMs}ms)`)
      }
    } catch (error) {
      this.stats.cliTools[tool] = {
        available: false,
        responsive: false,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
      
      if (this.options.warnOnFailure) {
        console.warn(`[ConnectivityMonitor] ⚠️ ${tool} check failed: ${error}`)
      }
    }
  }

  private async checkToolAvailable(tool: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('which', [tool])
      let found = false
      
      child.stdout?.on('data', () => {
        found = true
      })
      
      child.on('close', () => {
        resolve(found)
      })
      
      child.on('error', () => {
        resolve(false)
      })
      
      setTimeout(() => {
        child.kill()
        resolve(false)
      }, 5000)
    })
  }

  private async checkToolResponsive(tool: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(tool, ['--version'])
      let hasOutput = false
      
      child.stdout?.on('data', () => {
        hasOutput = true
      })
      
      child.on('close', (code) => {
        resolve(code === 0 && hasOutput)
      })
      
      child.on('error', () => {
        resolve(false)
      })
      
      setTimeout(() => {
        child.kill()
        resolve(false)
      }, this.options.timeoutMs)
    })
  }
}

export function createConnectivityMonitoringPlugin(options: ConnectivityMonitoringOptions = {}): LoopworkPlugin {
  const monitor = new ConnectivityMonitor(options)

  return {
    name: 'connectivity-monitor',
    
    onLoopStart: async () => {
      monitor.start()
    },

    onLoopEnd: async () => {
      monitor.stop()
      monitor.getStats()
    }
  }
}

export function withConnectivityMonitoring(options: ConnectivityMonitoringOptions = {}): ConfigWrapper {
  return (config) => {
    const typedConfig = config as LoopworkConfig
    return {
      ...typedConfig,
      plugins: [
        ...(typedConfig.plugins || []),
        createConnectivityMonitoringPlugin(options)
      ]
    }
  }
}

// Quota Monitor
export class QuotaMonitor {
  private options: Required<QuotaMonitoringOptions>
  private stats: QuotaStats
  private resetTimer: Timer | null = null

  constructor(options: QuotaMonitoringOptions = {}) {
    this.options = {
      enabled: options.enabled ?? true,
      dailyRequestLimit: options.dailyRequestLimit ?? 1000,
      dailyTokenLimit: options.dailyTokenLimit ?? 100000,
      warnThresholdPercent: options.warnThresholdPercent ?? 80,
      warnOnThreshold: options.warnOnThreshold ?? true,
    }

    this.stats = this.initializeStats()
  }

  private initializeStats(): QuotaStats {
    const now = new Date()
    const resetTime = new Date(now)
    resetTime.setHours(24, 0, 0, 0) // Next midnight
    
    return {
      requests: {
        count: 0,
        limit: this.options.dailyRequestLimit,
        usagePercent: 0,
      },
      tokens: {
        count: 0,
        limit: this.options.dailyTokenLimit,
        usagePercent: 0,
      },
      resetTime,
    }
  }

  start() {
    if (!this.options.enabled) return
    
    // Schedule daily reset
    const now = new Date()
    const msUntilMidnight = this.stats.resetTime.getTime() - now.getTime()
    
    this.resetTimer = setTimeout(() => {
      this.resetStats()
      // Set up recurring reset
      this.resetTimer = setInterval(() => this.resetStats(), 24 * 60 * 60 * 1000)
    }, msUntilMidnight)
  }

  stop() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
  }

  getStats(): QuotaStats {
    return this.stats
  }

  trackRequest(tokens: number = 0) {
    if (!this.options.enabled) return

    this.stats.requests.count++
    this.stats.requests.usagePercent = (this.stats.requests.count / this.stats.requests.limit) * 100

    if (tokens > 0) {
      this.stats.tokens.count += tokens
      this.stats.tokens.usagePercent = (this.stats.tokens.count / this.stats.tokens.limit) * 100
    }

    this.checkThresholds()
  }

  private checkThresholds() {
    if (!this.options.warnOnThreshold) return

    if (this.stats.requests.usagePercent >= this.options.warnThresholdPercent) {
      console.warn(
        `[QuotaMonitor] ⚠️ Request quota at ${this.stats.requests.usagePercent.toFixed(1)}% ` +
        `(${this.stats.requests.count}/${this.stats.requests.limit})`
      )
    }

    if (this.stats.tokens.usagePercent >= this.options.warnThresholdPercent) {
      console.warn(
        `[QuotaMonitor] ⚠️ Token quota at ${this.stats.tokens.usagePercent.toFixed(1)}% ` +
        `(${this.stats.tokens.count}/${this.stats.tokens.limit})`
      )
    }

    if (this.stats.requests.usagePercent >= 100) {
      console.error(`[QuotaMonitor] ❌ Daily request limit exceeded!`)
    }

    if (this.stats.tokens.usagePercent >= 100) {
      console.error(`[QuotaMonitor] ❌ Daily token limit exceeded!`)
    }
  }

  private resetStats() {
    this.stats = this.initializeStats()
    console.log('[QuotaMonitor] Daily quota reset')
  }
}

export function createQuotaMonitoringPlugin(options: QuotaMonitoringOptions = {}): LoopworkPlugin {
  const monitor = new QuotaMonitor(options)

  return {
    name: 'quota-monitor',
    
    onLoopStart: async () => {
      monitor.start()
    },

    onTaskComplete: async (_task, result) => {
      // Track request and token usage if available in result
      const tokens = (result as any)?.tokenUsage || 0
      monitor.trackRequest(tokens)
    },

    onLoopEnd: async () => {
      monitor.stop()
      const stats = monitor.getStats()
      console.log(
        `[QuotaMonitor] Session summary: ` +
        `${stats.requests.count} requests, ` +
        `${stats.tokens.count} tokens`
      )
    }
  }
}

export function withQuotaMonitoring(options: QuotaMonitoringOptions = {}): ConfigWrapper {
  return (config) => {
    const typedConfig = config as LoopworkConfig
    return {
      ...typedConfig,
      plugins: [
        ...(typedConfig.plugins || []),
        createQuotaMonitoringPlugin(options)
      ]
    }
  }
}
