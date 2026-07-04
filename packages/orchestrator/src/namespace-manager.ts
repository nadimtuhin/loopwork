import {
  INamespaceManager,
  Namespace,
  NamespaceMetadata,
  NamespaceResult,
  LockResult,
  CleanupOptions,
  Timestamp
} from '@loopwork-ai/contracts'
import { FileLock } from '@loopwork-ai/utils-fs'
import fs from 'fs'
import path from 'path'

export class NamespaceManager implements INamespaceManager {
  private projectRoot: string
  private loopworkDir: string
  private locks: Map<Namespace, FileLock> = new Map()

  constructor(options: { projectRoot?: string } = {}) {
    this.projectRoot = options.projectRoot || process.cwd()
    this.loopworkDir = path.join(this.projectRoot, '.loopwork')
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.loopworkDir)) {
      fs.mkdirSync(this.loopworkDir, { recursive: true })
    }
    
    const runsDir = path.join(this.loopworkDir, 'runs')
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true })
    }
  }

  async createNamespace(name: string, description?: string): Promise<NamespaceMetadata | null> {
    const id = name.trim().toLowerCase()
    
    if (!this.isValidNamespace(id)) {
      return null
    }

    const namespaces = this.listNamespaces()
    if (namespaces.find(ns => ns.id === id)) {
      return this.getNamespace(id)!
    }

    const now = Date.now()
    const metadata: NamespaceMetadata = {
      id,
      name,
      description,
      createdAt: now,
      lastAccessed: now,
      locked: false,
      activeAgents: 0
    }

    const namespaceRunDir = path.join(this.loopworkDir, 'runs', id)
    if (!fs.existsSync(namespaceRunDir)) {
      fs.mkdirSync(namespaceRunDir, { recursive: true })
    }

    const stateFile = this.getNamespaceStatePath(id)
    if (!fs.existsSync(stateFile)) {
      const initialState = {
        namespace: id,
        createdAt: now,
        description
      }
      fs.writeFileSync(stateFile, JSON.stringify(initialState, null, 2))
    }

    return metadata
  }

  listNamespaces(): NamespaceMetadata[] {
    const namespaces = new Set<string>(['default'])

    if (!fs.existsSync(this.loopworkDir)) {
      return [this.getNamespaceMetadata('default')]
    }

    const files = fs.readdirSync(this.loopworkDir)
    for (const file of files) {
      const match = file.match(/^state-(.+)\.json$/)
      if (match) {
        namespaces.add(match[1])
      }
    }

    const runsPath = path.join(this.loopworkDir, 'runs')
    if (fs.existsSync(runsPath)) {
      try {
        const entries = fs.readdirSync(runsPath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && this.isValidNamespace(entry.name)) {
            namespaces.add(entry.name)
          }
        }
      } catch {
      }
    }

    return Array.from(namespaces)
      .sort()
      .map(id => this.getNamespaceMetadata(id))
  }

  getNamespace(id: Namespace): NamespaceMetadata | undefined {
    if (!this.isValidNamespace(id)) {
      return undefined
    }

    const stateFile = this.getNamespaceStatePath(id)
    const runDir = path.join(this.loopworkDir, 'runs', id)

    if (!fs.existsSync(stateFile) && !fs.existsSync(runDir) && id !== 'default') {
      return undefined
    }

    return this.getNamespaceMetadata(id)
  }

  async deleteNamespace(id: Namespace): Promise<NamespaceResult> {
    if (id === 'default') {
      return { success: false, message: 'Cannot delete default namespace' }
    }

    try {
      const stateFile = this.getNamespaceStatePath(id)
      if (fs.existsSync(stateFile)) {
        fs.unlinkSync(stateFile)
      }

      const lockPath = this.getNamespaceLockPath(id)
      if (fs.existsSync(lockPath)) {
        fs.rmSync(lockPath, { recursive: true, force: true })
      }

      const runDir = path.join(this.loopworkDir, 'runs', id)
      if (fs.existsSync(runDir)) {
        fs.rmSync(runDir, { recursive: true, force: true })
      }

      return { success: true, message: `Namespace ${id} deleted successfully` }
    } catch (error: any) {
      return { success: false, message: `Failed to delete namespace ${id}`, error: error.message }
    }
  }

  async lockNamespace(id: Namespace): Promise<LockResult> {
    try {
      const lock = this.getOrCreateLock(id)
      const result = await lock.acquire()
      
      if (result.acquired) {
        return { success: true, lockId: process.pid.toString() }
      } else {
        return { success: false, error: `Namespace ${id} is already locked` }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  async unlockNamespace(id: Namespace): Promise<NamespaceResult> {
    try {
      const lock = this.getOrCreateLock(id)
      lock.release()
      return { success: true, message: `Namespace ${id} unlocked` }
    } catch (error: any) {
      return { success: false, message: `Failed to unlock namespace ${id}`, error: error.message }
    }
  }

  async isNamespaceLocked(id: Namespace): Promise<boolean> {
    const lock = this.getOrCreateLock(id)
    return lock.isLockOwner() || (await this.checkExternalLock(id))
  }

  private async checkExternalLock(id: Namespace): Promise<boolean> {
    const lockPath = this.getNamespaceLockPath(id)
    if (!fs.existsSync(lockPath)) return false
    
    try {
      const pidFile = path.join(lockPath, 'pid')
      if (!fs.existsSync(pidFile)) {
        const stats = fs.statSync(lockPath)
        const age = Date.now() - stats.mtimeMs
        if (age > 30000) {
          try {
            fs.rmSync(lockPath, { recursive: true, force: true })
          } catch {
          }
          return false
        }
        return true
      }
      const content = fs.readFileSync(pidFile, 'utf-8')
      const pid = parseInt(content, 10)
      if (isNaN(pid)) return true
      
      try {
        process.kill(pid, 0)
        return true
      } catch {
        try {
          fs.rmSync(lockPath, { recursive: true, force: true })
        } catch {
        }
        return false
      }
    } catch {
      return true
    }
  }

  async acquireAnyLock(): Promise<LockResult | null> {
    const namespaces = this.listNamespaces()
    for (const ns of namespaces) {
      const result = await this.lockNamespace(ns.id)
      if (result.success) {
        return result
      }
    }
    return null
  }

  async cleanupNamespaces(options?: CleanupOptions): Promise<NamespaceResult> {
    const namespaces = this.listNamespaces()
    let cleaned = 0

    for (const ns of namespaces) {
      if (ns.id === 'default') continue

      let shouldDelete = false

      if (options?.maxAge && (Date.now() - ns.lastAccessed) > options.maxAge) {
        shouldDelete = true
      }

      if (options?.deleteEmpty && ns.activeAgents === 0) {
        const runDir = path.join(this.loopworkDir, 'runs', ns.id)
        if (fs.existsSync(runDir)) {
          const sessions = fs.readdirSync(runDir)
          if (sessions.length === 0) {
            shouldDelete = true
          }
        } else {
          shouldDelete = true
        }
      }

      if (shouldDelete) {
        await this.deleteNamespace(ns.id)
        cleaned++
      }
    }

    return { success: true, message: `Cleaned up ${cleaned} namespaces` }
  }

  async touchNamespace(id: Namespace): Promise<void> {
    const runDir = path.join(this.loopworkDir, 'runs', id)
    if (fs.existsSync(runDir)) {
      const now = new Date()
      fs.utimesSync(runDir, now, now)
    }
    
    const stateFile = this.getNamespaceStatePath(id)
    if (fs.existsSync(stateFile)) {
      const now = new Date()
      fs.utimesSync(stateFile, now, now)
    }
  }

  getNamespaceCount(): number {
    return this.listNamespaces().length
  }

  private getOrCreateLock(id: Namespace): FileLock {
    if (!this.locks.has(id)) {
      const lockPath = this.getNamespaceLockPath(id)
      this.locks.set(id, new FileLock({ 
        filePath: lockPath,
        lockFile: lockPath,
        timeout: 1000,
        retryDelay: 100
      }))
    }
    return this.locks.get(id)!
  }

  private getNamespaceMetadata(id: Namespace): NamespaceMetadata {
    const stateFile = this.getNamespaceStatePath(id)
    const runDir = path.join(this.loopworkDir, 'runs', id)
    
    let createdAt: Timestamp = Date.now()
    let lastAccessed: Timestamp = Date.now()
    let description: string | undefined

    if (fs.existsSync(stateFile)) {
      try {
        const stats = fs.statSync(stateFile)
        createdAt = stats.birthtimeMs
        lastAccessed = stats.mtimeMs

        const content = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
        if (content.createdAt) createdAt = content.createdAt
        if (content.description) description = content.description
      } catch {
      }
    } else if (fs.existsSync(runDir)) {
      try {
        const stats = fs.statSync(runDir)
        createdAt = stats.birthtimeMs
        lastAccessed = stats.mtimeMs
      } catch {
      }
    }

    const lockPath = this.getNamespaceLockPath(id)
    let locked = fs.existsSync(lockPath)
    let lockId: string | undefined
    
    if (locked) {
      try {
        const pidFile = path.join(lockPath, 'pid')
        if (fs.existsSync(pidFile)) {
          lockId = fs.readFileSync(pidFile, 'utf-8').trim()
          const pid = parseInt(lockId, 10)
          if (!isNaN(pid)) {
            try {
              process.kill(pid, 0)
            } catch {
              locked = false
              lockId = undefined
            }
          }
        }
      } catch {
      }
    }

    return {
      id,
      name: id === 'default' ? 'Default' : id.charAt(0).toUpperCase() + id.slice(1),
      description,
      createdAt,
      lastAccessed,
      locked,
      lockId,
      activeAgents: this.countActiveAgents(id)
    }
  }

  private countActiveAgents(id: Namespace): number {
    const monitorStateFile = path.join(this.loopworkDir, 'monitor-state.json')
    if (fs.existsSync(monitorStateFile)) {
      try {
        const content = JSON.parse(fs.readFileSync(monitorStateFile, 'utf-8'))
        if (content.processes && Array.isArray(content.processes)) {
          return content.processes.filter((p: any) => p.namespace === id).length
        }
      } catch {
        return 0
      }
    }
    return 0
  }

  private getNamespaceStatePath(id: Namespace): string {
    const suffix = id === 'default' ? '' : `-${id}`
    return path.join(this.loopworkDir, `state${suffix}.json`)
  }

  private getNamespaceLockPath(id: Namespace): string {
    const suffix = id === 'default' ? '' : `-${id}`
    return path.join(this.loopworkDir, `state${suffix}.lock`)
  }

  private isValidNamespace(id: string): boolean {
    const validPattern = /^[a-z0-9][a-z0-9_-]*[a-z0-9_]$/
    return validPattern.test(id) && id.length <= 50
  }
}
