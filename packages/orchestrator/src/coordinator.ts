import {
  ICoordinator,
  INamespaceManager,
  CoordinatorConfig,
  OrchestrationOptions,
  OrchestrationResult,
  ClusterState,
  Namespace,
  NamespaceResult,
  NamespaceMetadata,
  LockId,
  CleanupOptions,
  ClusterStateFactory
} from '@loopwork-ai/contracts'
import { logger } from '@loopwork-ai/common'
import { NamespaceManager } from './namespace-manager'
import fs from 'fs'
import path from 'path'

export class ClusterCoordinator implements ICoordinator {
  private config?: CoordinatorConfig
  private namespaceManager: INamespaceManager
  private activeAgents: Map<Namespace, Set<string>> = new Map()

  private static readonly STALE_LOCK_TIMEOUT_MS = 30000

  constructor(namespaceManager?: INamespaceManager) {
    this.namespaceManager = namespaceManager || new NamespaceManager()
  }

  async initialize(config: CoordinatorConfig): Promise<void> {
    this.config = config
    if (this.namespaceManager.initialize) {
      await this.namespaceManager.initialize()
    }
    logger.info(`ClusterCoordinator initialized (defaultNamespace: ${config.defaultNamespace}, maxConcurrent: ${config.maxConcurrentNamespaces})`)
  }

  async dispose(): Promise<void> {
    if (this.namespaceManager.dispose) {
      await this.namespaceManager.dispose()
    }
    this.activeAgents.clear()
    logger.info('ClusterCoordinator disposed')
  }

  async orchestrate(options: OrchestrationOptions): Promise<OrchestrationResult> {
    const startTime = Date.now()
    const { namespace, taskId } = options

    logger.info(`Orchestration requested: ${taskId} in namespace ${namespace}`)

    const available = await this.isNamespaceAvailable(namespace)
    if (!available) {
      const error = `Namespace ${namespace} is not available (concurrency limit reached or already locked)`
      logger.warn(error)
      return {
        success: false,
        iterations: 0,
        taskId,
        duration: Date.now() - startTime,
        finalState: this.getClusterState(),
        error
      }
    }

    if (this.config?.enableLocking) {
      const lockResult = await this.namespaceManager.lockNamespace(namespace)
      if (!lockResult.success) {
        const error = `Failed to acquire lock for namespace ${namespace}: ${lockResult.error}`
        logger.error(error)
        return {
          success: false,
          iterations: 0,
          taskId,
          duration: Date.now() - startTime,
          finalState: this.getClusterState(),
          error
        }
      }
    }

    try {
      logger.info(`Namespace ${namespace} secured for task ${taskId}`)
      
      return {
        success: true,
        iterations: 0,
        taskId,
        duration: Date.now() - startTime,
        finalState: this.getClusterState()
      }
    } catch (error: any) {
      logger.error(`Orchestration error in ${namespace}: ${error.message}`)
      return {
        success: false,
        iterations: 0,
        taskId,
        duration: Date.now() - startTime,
        finalState: this.getClusterState(),
        error: error.message
      }
    } finally {
      if (this.config?.enableLocking) {
        await this.namespaceManager.unlockNamespace(namespace)
      }
    }
  }

  async stop(namespace: Namespace): Promise<NamespaceResult> {
    logger.info(`Stopping orchestration in namespace ${namespace}`)
    return this.namespaceManager.unlockNamespace(namespace)
  }

  getClusterState(): ClusterState {
    const namespaces = this.namespaceManager.listNamespaces()
    const namespaceMap = new Map<Namespace, NamespaceMetadata>()
    
    let activeNamespacesCount = 0
    let lockedNamespacesCount = 0

    for (const ns of namespaces) {
      namespaceMap.set(ns.id, ns)
      
      if (ns.activeAgents > 0 || ns.locked) {
        activeNamespacesCount++
      }
      
      if (ns.locked) {
        lockedNamespacesCount++
      }
    }

    return {
      namespaces: namespaceMap,
      timestamp: Date.now(),
      activeNamespaces: activeNamespacesCount,
      lockedNamespaces: lockedNamespacesCount,
      healthy: true
    }
  }

  async isNamespaceAvailable(namespace: Namespace): Promise<boolean> {
    const isLocked = await this.namespaceManager.isNamespaceLocked(namespace)
    
    if (isLocked) {
      return false
    }

    if (this.config) {
      const state = this.getClusterState()
      if (state.activeNamespaces >= this.config.maxConcurrentNamespaces) {
        const metadata = state.namespaces.get(namespace)
        const isCurrentActive = metadata && (metadata.locked || metadata.activeAgents > 0)
        
        if (!isCurrentActive) {
          logger.warn(`Concurrency limit reached: ${state.activeNamespaces}/${this.config.maxConcurrentNamespaces} active namespaces`)
          return false
        }
      }
    }

    return true
  }

  registerAgent(namespace: Namespace, agentId: string): void {
    if (!this.activeAgents.has(namespace)) {
      this.activeAgents.set(namespace, new Set())
    }
    this.activeAgents.get(namespace)!.add(agentId)
    this.namespaceManager.touchNamespace(namespace)
    logger.debug(`Agent ${agentId} registered in namespace ${namespace}`)
  }

  unregisterAgent(namespace: Namespace, agentId: string): void {
    const agents = this.activeAgents.get(namespace)
    if (agents) {
      agents.delete(agentId)
      if (agents.size === 0) {
        this.activeAgents.delete(namespace)
      }
    }
    this.namespaceManager.touchNamespace(namespace)
    logger.debug(`Agent ${agentId} unregistered from namespace ${namespace}`)
  }

  getNamespaceManager(): INamespaceManager {
    return this.namespaceManager
  }
}

export class DefaultClusterStateFactory implements ClusterStateFactory {
  create(config?: CoordinatorConfig): ClusterState {
    return {
      namespaces: new Map<Namespace, NamespaceMetadata>(),
      timestamp: Date.now(),
      activeNamespaces: 0,
      lockedNamespaces: 0,
      healthy: true
    }
  }
}
