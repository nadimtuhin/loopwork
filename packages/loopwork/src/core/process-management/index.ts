/**
 * Process Management Module
 *
 * Provides dependency-inverted process management with:
 * - IProcessManager interface for abstraction
 * - ProcessManager production implementation
 * - MockProcessManager for testing
 * - ProcessResourceMonitor for resource limit enforcement
 */

// Production implementation
export { ProcessManager, createProcessManager } from './process-manager'

// Mock implementation for testing
export { MockProcessManager } from './mock-process-manager'

// Resource monitoring
export {
  ProcessResourceMonitor,
  createProcessResourceMonitor,
  type ResourceLimits,
  type ProcessResourceUsage,
} from './monitor'

// Internal components (for advanced use)
export { ProcessRegistry } from './registry'
export { OrphanDetector } from './orphan-detector'
export { ProcessCleaner } from './cleaner'
