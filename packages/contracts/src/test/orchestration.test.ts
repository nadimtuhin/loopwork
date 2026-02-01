import { describe, expect, test } from 'bun:test'
import type { NamespaceResult, LockResult, NamespaceMetadata, INamespaceManager, CleanupOptions, CoordinatorConfig, OrchestrationOptions, OrchestrationResult, ICoordinator, ClusterStateSnapshot, ClusterState, ClusterStateFactory, ICoordinatorEvents, Namespace, LockId, Timestamp, NamespaceList, OrchestrationEvent, OrchestrationEventListener } from '../orchestration'

describe('orchestration', () => {
  test('should import all types without error', () => {
    expect(true).toBe(true)
  })
})
