/**
 * Orphan detector stub
 * 
 * This module was refactored into orphan-killer.ts and orphan-detection-v2/
 * This stub exists for backward compatibility with existing code.
 */

import type { OrphanInfo } from '@loopwork-ai/contracts/process'

export interface DetectOrphansOptions {
  projectRoot?: string
}

/**
 * Stub function for orphan detection
 * Returns empty array - actual implementation moved to orphan-killer
 */
export async function detectOrphans(options: DetectOrphansOptions = {}): Promise<OrphanInfo[]> {
  // Return empty array - orphan detection is now handled by OrphanKiller class
  return []
}

/**
 * Stub exports for test compatibility
 */
export function trackSpawnedPid(pid: number): void {
  // No-op stub
}

export function untrackPid(pid: number): void {
  // No-op stub
}

export function getTrackedPids(): number[] {
  return []
}

export interface OrphanProcess {
  pid: number
  command: string
  age: number
}
