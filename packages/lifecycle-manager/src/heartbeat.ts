import { EventEmitter } from 'events'
import fs from 'fs'
import path from 'path'
import {
  IHeartbeatProvider,
  HeartbeatConfig,
  HeartbeatEvent,
} from '@loopwork-ai/contracts'
import { logger } from '@loopwork-ai/common'

export class FileHeartbeatProvider extends EventEmitter implements IHeartbeatProvider {
  public readonly id: string
  public readonly name: string
  public readonly config: HeartbeatConfig
  public isActive: boolean = false
  public totalBeats: number = 0
  public lastBeat: Date | null = null

  private intervalId: ReturnType<typeof setInterval> | null = null
  private filePath: string

  constructor(id: string, name: string, filePath: string, config: Partial<HeartbeatConfig> = {}) {
    super()
    this.id = id
    this.name = name
    this.filePath = filePath
    this.config = {
      interval: 30000,
      maxMissed: 3,
      retryInterval: 5000,
      autoRestart: false,
      ...config,
    }
  }

  async start(): Promise<void> {
    if (this.isActive) {
      throw new Error(`Heartbeat provider ${this.id} is already active`)
    }

    this.isActive = true
    this.intervalId = setInterval(() => {
      this.beat().catch((error) => {
        this.emit('error', error)
      })
    }, this.config.interval)

    await this.beat()
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isActive = false
    this.emit('stopped', 'Requested')
  }

  async beat(): Promise<HeartbeatEvent> {
    const timestamp = new Date()
    const sequence = ++this.totalBeats
    
    const event: HeartbeatEvent = {
      timestamp,
      sequence,
      source: this.id,
      payload: this.config.payload,
    }

    try {
      const data = JSON.stringify({
        pid: process.pid,
        ...event,
      })
      
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(this.filePath, data, 'utf-8')
      this.lastBeat = timestamp
      this.emit('beat', event)
      return event
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emit('error', err)
      throw err
    }
  }

  reset(): void {
    this.totalBeats = 0
    this.lastBeat = null
  }

  static isStale(filePath: string, timeoutMs: number): boolean {
    if (!fs.existsSync(filePath)) {
      return true
    }

    try {
      const stat = fs.statSync(filePath)
      const age = Date.now() - stat.mtimeMs
      if (age > timeoutMs) {
        return true
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      const pid = data.pid

      if (pid) {
        try {
          process.kill(pid, 0)
        } catch {
          return true
        }
      }
    } catch (e: unknown) {
      logger.warn(`Failed to check heartbeat staleness for ${filePath}: ${e instanceof Error ? e.message : String(e)}`)
      return true
    }

    return false
  }
}
