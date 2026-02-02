/**
 * Process Spawner Factory
 *
 * Re-exports process spawners from @loopwork-ai/process-manager package.
 * The actual implementations are maintained in the process-manager package.
 */

// Re-export spawner implementations from process-manager
export {
  StandardSpawner,
  PtySpawner,
  isPtyAvailable,
  createSpawner,
  getDefaultSpawner,
  resetDefaultSpawner,
  isPtyFunctional,
} from '@loopwork-ai/process-manager'

// BunSpawner remains here as it's specific to Bun runtime
export { BunSpawner } from './bun-spawner'
